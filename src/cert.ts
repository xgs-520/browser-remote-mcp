import { generate } from 'selfsigned';
import fs from 'fs';
import path from 'path';

export interface Certificate {
  cert: string;
  key: string;
}

/**
 * Generate a self-signed certificate for HTTPS.
 * If cert.pem and key.pem already exist in the given directory, reuse them.
 * Otherwise generate new ones and save to disk.
 */
export function getOrCreateCertificate(certDir: string): Certificate {
  const certPath = path.join(certDir, 'cert.pem');
  const keyPath = path.join(certDir, 'key.pem');

  // Reuse existing certificates if available
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return {
      cert: fs.readFileSync(certPath, 'utf-8'),
      key: fs.readFileSync(keyPath, 'utf-8'),
    };
  }

  // Generate new self-signed certificate
  const attrs = [
    { name: 'commonName', value: 'browser-remote-mcp' },
    { name: 'organizationName', value: 'Huawei Cloud' },
  ];

  const opts = {
    keySize: 2048,
    days: 365,
    algorithm: 'sha256',
  };

  const pems = generate(attrs, opts);

  // Save to disk for reuse
  fs.mkdirSync(certDir, { recursive: true });
  fs.writeFileSync(certPath, pems.cert, { mode: 0o600 });
  fs.writeFileSync(keyPath, pems.private, { mode: 0o600 });

  return {
    cert: pems.cert,
    key: pems.private,
  };
}
