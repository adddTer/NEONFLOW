/**
 * Client-side metadata parser to extract Cover Art.
 * Robustly handles ID3v2.2, v2.3, v2.4 tags and FLAC Vorbis Comment Picture Blocks.
 */

export const extractCoverArt = async (file: File, logger?: (msg: string) => void): Promise<string | undefined> => {
  const log = (msg: string) => logger?.(`[Metadata] ${msg}`);
  
  try {
    log(`Starting analysis: ${file.name} (${file.size} bytes)`);
    // Read first 4MB. 
    const buffer = await file.slice(0, 4 * 1024 * 1024).arrayBuffer();
    const data = new Uint8Array(buffer);
    
    // 1. Check for FLAC ('fLaC')
    if (data[0] === 0x66 && data[1] === 0x4C && data[2] === 0x61 && data[3] === 0x43) {
        log("Detected FLAC signature");
        return parseFLAC(data, log);
    }

    // 2. Check for ID3v2 ('ID3')
    if (data.length >= 10 && data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33) {
        log("Detected ID3v2 signature");
        return parseID3(data, log);
    }
    
    log("No supported metadata header found (checked ID3 and fLaC)");

  } catch (e: any) {
      log(`Error: ${e.message}`);
      console.warn("Metadata parsing warning:", e);
  }
  return undefined;
};

// --- FLAC PARSER ---

const parseFLAC = (data: Uint8Array, log: (msg: string) => void): string | undefined => {
    let offset = 4; // Skip 'fLaC'
    let isLast = false;

    while (!isLast && offset < data.length) {
        // Block Header: 1 byte (Last flag + Type) + 3 bytes (Length)
        if (offset + 4 > data.length) {
            log("Unexpected EOF in FLAC block header");
            break;
        }

        const header = data[offset];
        isLast = (header & 0x80) !== 0;
        const type = header & 0x7F;
        const length = ((data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]);
        
        offset += 4; // Move past header

        log(`Block Found - Type: ${type}, Length: ${length}, Last: ${isLast}`);

        if (type === 6) { // PICTURE
            log("Parsing PICTURE block...");
            try {
                return parseFlacPicture(data, offset, length, log);
            } catch (e: any) {
                log(`Failed to parse picture block: ${e.message}`);
            }
        }

        offset += length;
    }
    return undefined;
};

const parseFlacPicture = (data: Uint8Array, offset: number, length: number, log: (msg: string) => void): string | undefined => {
    let ptr = offset;
    const max = offset + length;
    
    if (max > data.length) throw new Error("Block length exceeds buffer");

    // Picture Type (32-bit BE)
    const picType = readUInt32BE(data, ptr); ptr += 4;
    log(`Picture Type: ${picType} (3=Front Cover)`);

    // MIME Type Length (32-bit BE)
    const mimeLen = readUInt32BE(data, ptr); ptr += 4;
    const mime = new TextDecoder().decode(data.slice(ptr, ptr + mimeLen)); ptr += mimeLen;
    log(`MIME: ${mime}`);

    // Description Length (32-bit BE)
    const descLen = readUInt32BE(data, ptr); ptr += 4;
    ptr += descLen; // Skip description

    // Dimensions & Color Depth (4 * 4 bytes)
    const width = readUInt32BE(data, ptr); ptr += 4;
    const height = readUInt32BE(data, ptr); ptr += 4;
    const depth = readUInt32BE(data, ptr); ptr += 4;
    const colors = readUInt32BE(data, ptr); ptr += 4;
    log(`Image Info: ${width}x${height}, ${depth}bpp`);

    // Picture Data Length (32-bit BE)
    const dataLen = readUInt32BE(data, ptr); ptr += 4;
    log(`Image Data Size: ${dataLen} bytes`);

    if (dataLen > 0) {
        if (ptr + dataLen > data.length) {
            log("Warning: Image data truncated in buffer");
            // Still try to read what we have if buffer was capped
        }
        const safeEnd = Math.min(ptr + dataLen, data.length);
        const imgBytes = data.slice(ptr, safeEnd);
        const base64 = bufferToBase64(imgBytes);
        
        // Fix common MIME types for FLAC
        let finalMime = mime;
        if (finalMime === 'image/jpg') finalMime = 'image/jpeg';
        if (!finalMime) {
             // Sniff
             if (imgBytes[0] === 0xFF && imgBytes[1] === 0xD8) finalMime = 'image/jpeg';
             else if (imgBytes[0] === 0x89 && imgBytes[1] === 0x50) finalMime = 'image/png';
        }

        return `data:${finalMime};base64,${base64}`;
    }

    return undefined;
};

// --- ID3 PARSER (Updated with logging) ---

const parseID3 = (data: Uint8Array, log: (msg: string) => void): string | undefined => {
    const version = data[3]; // 2, 3, or 4
    log(`ID3 Version: 2.${version}.0`);
    
    const flags = data[5];
    const size = decodeSynchsafe(data.slice(6, 10));
    log(`ID3 Tag Size: ${size}`);
    
    const limit = Math.min(data.length, size + 10);
    let offset = 10;

    // Skip Extended Header if present
    if ((flags & 0x40) !== 0) {
        let extSize = decodeSynchsafe(data.slice(offset, offset + 4));
        if (version === 3) extSize = readUInt32BE(data, offset); 
        offset += extSize + 4; 
        log(`Skipped Extended Header (${extSize} bytes)`);
    }

    while (offset < limit) {
        if (data[offset] === 0) break; // Padding

        let frameId = '';
        let frameSize = 0;
        let headerLen = 0;

        if (version === 2) {
            frameId = String.fromCharCode(data[offset], data[offset+1], data[offset+2]);
            frameSize = (data[offset+3] << 16) | (data[offset+4] << 8) | data[offset+5];
            headerLen = 6;
        } else if (version === 3) {
            frameId = String.fromCharCode(data[offset], data[offset+1], data[offset+2], data[offset+3]);
            frameSize = readUInt32BE(data, offset + 4);
            headerLen = 10;
        } else if (version === 4) {
            frameId = String.fromCharCode(data[offset], data[offset+1], data[offset+2], data[offset+3]);
            frameSize = decodeSynchsafe(data.slice(offset + 4, offset + 8));
            headerLen = 10;
        }

        const nextOffset = offset + headerLen + frameSize;
        // log(`Frame: ${frameId}, Size: ${frameSize}`);

        if (frameId === 'APIC' || frameId === 'PIC') {
            log(`Found Cover Frame: ${frameId}`);
            const picData = parseID3APIC(data, offset + headerLen, nextOffset, version, log);
            if (picData) return picData;
        }

        offset = nextOffset;
    }
    return undefined;
};

const parseID3APIC = (data: Uint8Array, start: number, end: number, version: number, log: (msg: string) => void): string | undefined => {
    if (start >= end) return undefined;
    let ptr = start;
    const encoding = data[ptr++];
    let mime = '';

    if (version === 2) {
        const format = String.fromCharCode(data[ptr], data[ptr+1], data[ptr+2]);
        ptr += 3;
        if (format === 'JPG') mime = 'image/jpeg';
        else if (format === 'PNG') mime = 'image/png';
        else mime = 'image/' + format.toLowerCase();
    } else {
        let mimeStart = ptr;
        while (ptr < end && data[ptr] !== 0) ptr++;
        mime = String.fromCharCode(...data.slice(mimeStart, ptr));
        ptr++; 
    }
    
    log(`APIC Mime: ${mime}, Encoding: ${encoding}`);

    ptr++; // Skip Picture Type

    // Skip Description
    if (encoding === 0 || encoding === 3) {
        while (ptr < end && data[ptr] !== 0) ptr++;
        ptr++;
    } else if (encoding === 1 || encoding === 2) {
        while (ptr < end - 1) {
            if (data[ptr] === 0 && data[ptr+1] === 0) {
                ptr += 2;
                break;
            }
            ptr++;
        }
    }

    if (ptr >= end) return undefined;
    
    // Fallback sniffing
    const signature = data.slice(ptr, ptr + 4);
    if (signature[0] === 0xFF && signature[1] === 0xD8) mime = 'image/jpeg';
    else if (signature[0] === 0x89 && signature[1] === 0x50) mime = 'image/png';

    if (!mime) {
        log("Could not determine mime type");
        return undefined;
    }

    const imgBytes = data.slice(ptr, end);
    return `data:${mime};base64,${bufferToBase64(imgBytes)}`;
};

// --- UTILS ---

const decodeSynchsafe = (bytes: Uint8Array): number => {
    let size = 0;
    for (const byte of bytes) {
        size = (size << 7) | (byte & 0x7f);
    }
    return size;
};

const readUInt32BE = (data: Uint8Array, offset: number): number => {
    return ((data[offset] << 24) | (data[offset+1] << 16) | (data[offset+2] << 8) | data[offset+3]) >>> 0;
};

const bufferToBase64 = (bytes: Uint8Array) => {
    let binary = '';
    const len = bytes.byteLength;
    const chunkSize = 8192;
    for (let i = 0; i < len; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(i + chunkSize, len))));
    }
    return btoa(binary);
};