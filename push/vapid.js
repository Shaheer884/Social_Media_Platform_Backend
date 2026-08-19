const webpush = require('web-push');

/**
 * Generates a public and private VAPID key pair.
 * Prints out the keys with instructions on how to add them to .env.
 */
const generateVapidKeys = () => {
  const vapidKeys = webpush.generateVAPIDKeys();
  console.log('\n====================================');
  console.log('⚡ CONNECTHUB VAPID KEYS GENERATED ⚡');
  console.log('====================================');
  console.log('Public Key:\n', vapidKeys.publicKey);
  console.log('\nPrivate Key:\n', vapidKeys.privateKey);
  console.log('====================================');
  console.log('Please copy these keys to your backend .env file:');
  console.log(`VAPID_PUBLIC_KEY="${vapidKeys.publicKey}"`);
  console.log(`VAPID_PRIVATE_KEY="${vapidKeys.privateKey}"`);
  console.log('VAPID_SUBJECT="mailto:hafizshaheer88@gmail.com"');
  console.log('====================================\n');
  return vapidKeys;
};

// If run directly via command line
if (require.main === module) {
  generateVapidKeys();
}

module.exports = { generateVapidKeys };
