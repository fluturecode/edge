import { jwtDecode } from 'jwt-decode';
import { jwtToAddress } from '@mysten/zklogin';

export function getZkLoginAddress(idToken: string): string {
  const decoded = jwtDecode(idToken) as { sub: string; iss: string };
  // jwtToAddress derives a deterministic Sui address from the JWT
  // The address is unique per Google account, permanent, and invisible to the user
  return jwtToAddress(idToken, 0);
}

export function getDecodedJwt(idToken: string) {
  return jwtDecode(idToken) as {
    sub: string;
    email: string;
    name: string;
    picture: string;
    iss: string;
    aud: string;
  };
}