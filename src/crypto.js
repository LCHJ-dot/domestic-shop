'use strict';
const crypto = require('crypto');

// 用商户私钥对字符串做 RSA-SHA256 签名，输出 base64
function signRSA(privateKeyPem, data) {
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(data, 'utf8');
  return sign.sign(privateKeyPem, 'base64');
}

// 用公钥验签（微信回调用平台公钥；支付宝回调用支付宝公钥）
function verifyRSA(publicKeyPem, data, signatureBase64) {
  const verify = crypto.createVerify('RSA-SHA256');
  verify.update(data, 'utf8');
  return verify.verify(publicKeyPem, signatureBase64, 'base64');
}

// 微信支付 V3 回调报文解密（AES-256-GCM）
// resource = { ciphertext, nonce, associated_data }
function decryptWechatResource(apiV3Key, resource) {
  const key = Buffer.from(apiV3Key, 'utf8'); // 32 字节
  const nonce = Buffer.from(resource.nonce, 'utf8');
  const ciphertext = Buffer.from(resource.ciphertext, 'base64');
  const authTag = ciphertext.slice(ciphertext.length - 16);
  const data = ciphertext.slice(0, ciphertext.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  if (resource.associated_data) {
    decipher.setAAD(Buffer.from(resource.associated_data, 'utf8'));
  }
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(data, null, 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}

function randomString(len = 32) {
  return crypto.randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len);
}

module.exports = { signRSA, verifyRSA, decryptWechatResource, randomString };
