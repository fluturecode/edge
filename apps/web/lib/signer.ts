import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

// Get the zkLogin JWT from localStorage
export function getIdToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('edge_id_token');
}

// Get the user's Sui address
export function getUserAddress(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('edge_sui_address');
}

// Store the user's Sui address
export function setUserAddress(address: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('edge_sui_address', address);
}