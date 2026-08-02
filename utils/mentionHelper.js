const User = require('../models/User');
const Notification = require('../models/Notification');

/**
 * Parses text for @username mentions, verifies they are mutual friends of the sender,
 * and sends a mention notification to them.
 * 
 * @param {string} text The post/comment/story content
 * @param {string} senderId The ID of the user mentioning
 * @param {object} referenceObj Object containing reference e.g., { post: postId } or { story: storyId }
 * @param {string} message Custom action message e.g. "mentioned you in a post"
 */
const handleMentions = async (text, senderId, referenceObj, message) => {
  if (!text || typeof text !== 'string') return;

  // Matches @username
  const mentionRegex = /@([a-zA-Z0-9_]+)/g;
  const matches = [...text.matchAll(mentionRegex)];
  if (matches.length === 0) return;

  // Extract unique usernames in lowercase/exact
  const usernames = [...new Set(matches.map(m => m[1]))];
  if (usernames.length === 0) return;

  try {
    // Find users
    const users = await User.find({ username: { $in: usernames } });
    if (users.length === 0) return;

    const sender = await User.findById(senderId);
    if (!sender) return;

    for (const user of users) {
      if (user._id.toString() === senderId.toString()) continue;

      // Check mutual following (friends)
      const isFollowing = sender.following.some(id => id.toString() === user._id.toString());
      const isFollower = sender.followers.some(id => id.toString() === user._id.toString());
      const isFriend = isFollowing && isFollower;

      if (isFriend) {
        // Prevent duplicate mention notification for same action
        const existing = await Notification.findOne({
          recipient: user._id,
          sender: senderId,
          type: 'mention',
          ...referenceObj
        });

        if (!existing) {
          await Notification.create({
            recipient: user._id,
            sender: senderId,
            type: 'mention',
            message: message,
            ...referenceObj
          });
        }
      }
    }
  } catch (error) {
    console.error('Error handling mentions:', error);
  }
};

module.exports = { handleMentions };
