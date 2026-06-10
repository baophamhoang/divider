import { customAlphabet } from 'nanoid';

/**
 * Generate a short, URL-safe id. Used as a session's primary key AND as its
 * unguessable share token (the `/s/<id>` link is the only access control —
 * 16 chars of [0-9a-z] is ~82 bits, far beyond brute-forcing for a friend group).
 */
export const newId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);
