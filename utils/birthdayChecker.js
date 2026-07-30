const User = require('../models/User');
const Notification = require('../models/Notification');
const sendEmail = require('./sendEmail');

const checkAndSendBirthdayNotifications = async () => {
  try {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    // Fetch all users with birthdays
    const users = await User.find({ birthday: { $ne: null } })
      .populate('followers', '_id email')
      .populate('following', '_id email');

    console.log(`[Birthday Checker] Checking birthdays for ${users.length} users...`);

    for (const user of users) {
      const birthDate = new Date(user.birthday);
      // Check if birthday is today (month & day match)
      if (birthDate.getMonth() === today.getMonth() && birthDate.getDate() === today.getDate()) {
        console.log(`[Birthday Checker] Today is ${user.fullName}'s birthday!`);

        // 1. Send self birthday notification & email
        const selfNotifExists = await Notification.findOne({
          recipient: user._id,
          sender: user._id,
          type: 'birthday',
          createdAt: { $gte: startOfToday, $lte: endOfToday }
        });

        if (!selfNotifExists) {
          // Create in-app notification
          await Notification.create({
            recipient: user._id,
            sender: user._id,
            type: 'birthday',
            createdAt: today
          });

          // Send email
          await sendEmail({
            to: user.email,
            subject: `🎉 Happy Birthday, ${user.fullName}!`,
            text: `Happy Birthday, ${user.fullName}! 🎂\n\nWishing you a wonderful day filled with love and laughter. Thank you for being a part of ConnectHub!\n\nBest wishes,\nThe ConnectHub Team`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                <h2 style="color: #6366f1; text-align: center;">🎉 Happy Birthday, ${user.fullName}! 🎂</h2>
                <p>Dear ${user.fullName},</p>
                <p>Wishing you a wonderful day filled with love, laughter, and happiness. Thank you for being a valued member of the <strong>ConnectHub</strong> community!</p>
                <p>Have an amazing day!</p>
                <br />
                <p style="color: #888; font-size: 0.9em;">Best wishes,<br />The ConnectHub Team</p>
              </div>
            `
          });
        }

        // 2. Notify friends (mutual followers)
        // Privacy setting check
        const privacy = user.birthdayPrivacy || 'Public';
        if (privacy === 'Public' || privacy === 'Friends Only') {
          // Identify friends
          const friends = user.followers.filter(follower => 
            user.following.some(followingUser => followingUser._id.toString() === follower._id.toString())
          );

          for (const friend of friends) {
            // Check if notification already sent to friend today
            const friendNotifExists = await Notification.findOne({
              recipient: friend._id,
              sender: user._id,
              type: 'birthday',
              createdAt: { $gte: startOfToday, $lte: endOfToday }
            });

            if (!friendNotifExists) {
              await Notification.create({
                recipient: friend._id,
                sender: user._id,
                type: 'birthday',
                createdAt: today
              });
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error running birthday checker:', error);
  }
};

const startBirthdayChecker = () => {
  // Run once after server starts (e.g. 5 seconds delay)
  setTimeout(checkAndSendBirthdayNotifications, 5000);

  // Run every 12 hours (12 * 60 * 60 * 1000 ms)
  setInterval(checkAndSendBirthdayNotifications, 43200000);
};

module.exports = { startBirthdayChecker };
