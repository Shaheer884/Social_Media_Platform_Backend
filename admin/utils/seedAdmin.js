const User = require('../../models/User');
const bcrypt = require('bcryptjs');

const seedAdmin = async () => {
  try {
    const adminEmail = 'hafizshaheer88@gmail.com';
    const adminUsername = 'admin';

    // Check if any admin account exists (by role)
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      console.log('Admin account already exists in database.');
      return;
    }

    // Check if user with that email exists as a regular user
    const userByEmail = await User.findOne({ email: adminEmail });
    if (userByEmail) {
      userByEmail.role = 'admin';
      userByEmail.fullName = 'Admin';
      userByEmail.username = adminUsername;
      userByEmail.isVerified = true;
      userByEmail.isSuspended = false;
      userByEmail.isDeleted = false;
      
      const salt = await bcrypt.genSalt(10);
      userByEmail.passwordHash = await bcrypt.hash('Admin@123', salt);
      
      await userByEmail.save();
      console.log('Existing user found with admin email. Promoted to Admin and updated details.');
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('Admin@123', salt);

    await User.create({
      fullName: 'Admin',
      username: adminUsername,
      email: adminEmail,
      passwordHash: passwordHash,
      role: 'admin',
      isVerified: true,
      isSuspended: false,
      isDeleted: false
    });

    console.log('Default Admin Account seeded successfully!');
  } catch (error) {
    console.error('Error seeding admin account:', error);
  }
};

module.exports = seedAdmin;
