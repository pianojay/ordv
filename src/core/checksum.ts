import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

// Shared by Node and the browser. Version-2 text hashes cover the exact UTF-8
// content stored in the plan; discovery removes only an initial BOM.
export const checksum = (text: string) => bytesToHex(sha256(utf8ToBytes(text)));
