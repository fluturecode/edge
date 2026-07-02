import { EdgePassConfig, EdgePassObject } from '../utils/types';

// ── Dynamic JWT types ──────────────────────────────────────────────────────────

export interface DynamicJWTPayload {
  sub:              string;         // Dynamic user ID
  email?:           string;
  verified_credentials?: {
    address:        string;         // wallet address
    chain:          string;
    wallet_name?:   string;
    wallet_provider?: string;
  }[];
  environment_id:   string;         // Dynamic environment
  iat:              number;         // issued at
  exp:              number;         // expires at
  iss:              string;         // issuer (Dynamic)
  // Enterprise fields
  org_id?:          string;
  role?:            string;
  department?:      string;
  custom_fields?:   Record<string, unknown>;
}

export interface DynamicIdentity {
  userId:           string;         // Dynamic sub
  walletAddress:    string;         // Primary verified wallet
  environmentId:    string;
  email?:           string;
  orgId?:           string;
  role?:            string;
  department?:      string;
  sessionValid:     boolean;
  expiresAt:        number;
  rawPayload:       DynamicJWTPayload;
}

export interface IdentityBoundEdgePass extends EdgePassObject {
  identity: {
    dynamicUserId:     string;
    walletAddress:     string;
    environmentId:     string;
    boundAt:           number;
    sessionExpiry:     number;
    orgId?:            string;
    role?:             string;
  };
}

// ── JWT verification ───────────────────────────────────────────────────────────

/**
 * Parse and verify a Dynamic JWT.
 *
 * For production, pass a verifyFn that validates the JWT signature
 * against Dynamic's JWKS endpoint. For development, basic parsing is used.
 *
 * @example
 * // Production — verify with Dynamic's public keys
 * const identity = await parseDynamicJWT(token, async (payload) => {
 *   const jwks = await fetchDynamicJWKS(payload.environment_id);
 *   return verifyJWTSignature(token, jwks);
 * });
 *
 * // Development — parse without signature verification
 * const identity = await parseDynamicJWT(token);
 */
export async function parseDynamicJWT(
  token:     string,
  verifyFn?: (payload: DynamicJWTPayload) => Promise<boolean>
): Promise<DynamicIdentity> {
  // Decode JWT payload (base64url)
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('DynamicIdentity: invalid JWT format — expected 3 parts');
  }

  let payload: DynamicJWTPayload;
  try {
    const decoded = Buffer.from(parts[1], 'base64url').toString('utf8');
    payload = JSON.parse(decoded);
  } catch {
    throw new Error('DynamicIdentity: failed to decode JWT payload');
  }

  // Expiry check
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error(
      `DynamicIdentity: JWT expired at ${new Date(payload.exp * 1000).toISOString()}. ` +
      `Request a fresh token from Dynamic.`
    );
  }

  // Issuer check
  if (payload.iss && !payload.iss.includes('dynamic')) {
    throw new Error(
      `DynamicIdentity: unexpected JWT issuer "${payload.iss}". ` +
      `Expected a Dynamic-issued token.`
    );
  }

  // Optional signature verification
  if (verifyFn) {
    const valid = await verifyFn(payload);
    if (!valid) {
      throw new Error('DynamicIdentity: JWT signature verification failed');
    }
  }

  // Extract primary wallet
  const primaryWallet = payload.verified_credentials?.find(
    vc => vc.chain === 'evm' || vc.wallet_provider === 'browserExtension'
  ) ?? payload.verified_credentials?.[0];

  if (!primaryWallet) {
    throw new Error(
      'DynamicIdentity: no verified wallet found in JWT. ' +
      'Ensure the user has connected a wallet in Dynamic.'
    );
  }

  return {
    userId:        payload.sub,
    walletAddress: primaryWallet.address,
    environmentId: payload.environment_id,
    email:         payload.email,
    orgId:         payload.org_id,
    role:          payload.role,
    department:    payload.department,
    sessionValid:  true,
    expiresAt:     payload.exp * 1000, // convert to ms
    rawPayload:    payload,
  };
}

// ── Identity binding ───────────────────────────────────────────────────────────

export class DynamicIdentityEngine {

  /**
   * Bind a Dynamic identity to an EdgePass.
   * The resulting IdentityBoundEdgePass can only be used within
   * the context of that Dynamic session.
   *
   * @example
   * const identity = await parseDynamicJWT(userToken);
   * const boundPass = DynamicIdentityEngine.bind(edgePass, identity);
   *
   * // Later — verify before executing
   * DynamicIdentityEngine.verify(boundPass, identity);
   * await sdk.execute(boundPass, request, signer);
   */
  static bind(
    pass:     EdgePassObject,
    identity: DynamicIdentity
  ): IdentityBoundEdgePass {
    if (!identity.sessionValid) {
      throw new Error('DynamicIdentityEngine.bind: cannot bind an invalid Dynamic session');
    }

    return {
      ...pass,
      identity: {
        dynamicUserId:  identity.userId,
        walletAddress:  identity.walletAddress,
        environmentId:  identity.environmentId,
        boundAt:        Date.now(),
        sessionExpiry:  identity.expiresAt,
        orgId:          identity.orgId,
        role:           identity.role,
      },
    };
  }

  /**
   * Verify that a bound EdgePass matches the current Dynamic identity.
   * Throws if the identity doesn't match or the session has expired.
   *
   * Call this before every sdk.execute() on an identity-bound pass.
   */
  static verify(
    pass:     IdentityBoundEdgePass,
    identity: DynamicIdentity
  ): void {
    // Session expiry
    if (Date.now() > pass.identity.sessionExpiry) {
      throw new Error(
        `DynamicIdentityEngine.verify: Dynamic session expired at ` +
        `${new Date(pass.identity.sessionExpiry).toISOString()}. ` +
        `Re-authenticate with Dynamic to continue.`
      );
    }

    // User ID match
    if (pass.identity.dynamicUserId !== identity.userId) {
      throw new Error(
        `DynamicIdentityEngine.verify: identity mismatch. ` +
        `Pass was bound to user "${pass.identity.dynamicUserId}" ` +
        `but current session is "${identity.userId}".`
      );
    }

    // Wallet address match
    if (pass.identity.walletAddress !== identity.walletAddress) {
      throw new Error(
        `DynamicIdentityEngine.verify: wallet address mismatch. ` +
        `Pass was bound to wallet "${pass.identity.walletAddress}" ` +
        `but current session wallet is "${identity.walletAddress}".`
      );
    }

    // Environment match
    if (pass.identity.environmentId !== identity.environmentId) {
      throw new Error(
        `DynamicIdentityEngine.verify: environment mismatch. ` +
        `Pass was bound to Dynamic environment "${pass.identity.environmentId}" ` +
        `but current session is "${identity.environmentId}".`
      );
    }
  }

  /**
   * Check if an EdgePass is identity-bound.
   */
  static isBound(pass: EdgePassObject): pass is IdentityBoundEdgePass {
    return 'identity' in pass && typeof (pass as IdentityBoundEdgePass).identity === 'object';
  }

  /**
   * Generate an audit entry for a transaction executed under a Dynamic identity.
   * Use this to build your compliance audit trail.
   */
  static auditEntry(
    pass:      IdentityBoundEdgePass,
    digest:    string,
    request:   { merchant: string; amount: bigint; amountUSD?: string }
  ): Record<string, unknown> {
    return {
      timestamp:      new Date().toISOString(),
      edgeDigest:     digest,
      dynamicUserId:  pass.identity.dynamicUserId,
      walletAddress:  pass.identity.walletAddress,
      orgId:          pass.identity.orgId,
      role:           pass.identity.role,
      edgePassId:     pass.id,
      merchant:       request.merchant,
      amount:         request.amount.toString(),
      amountUSD:      request.amountUSD,
      sessionExpiry:  new Date(pass.identity.sessionExpiry).toISOString(),
      boundAt:        new Date(pass.identity.boundAt).toISOString(),
    };
  }
}
