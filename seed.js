const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

const User = require('./models/User');
const Post = require('./models/Post');
const Comment = require('./models/Comment');
const Notification = require('./models/Notification');

const usersData = [
  {
    username: 'alice',
    email: 'alice@example.com',
    fullName: 'Alice Johnson',
    bio: 'Digital artist & designer 🎨. Love crafting elegant visual experiences.',
    location: 'San Francisco, CA',
    profilePicture: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    coverPhoto: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800'
  },
  {
    username: 'bob',
    email: 'bob@example.com',
    fullName: 'Bob Smith',
    bio: 'Software engineer & tech enthusiast 💻. Coffee lover. Building the future.',
    location: 'Seattle, WA',
    profilePicture: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    coverPhoto: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800'
  },
  {
    username: 'charlie',
    email: 'charlie@example.com',
    fullName: 'Charlie Davis',
    bio: 'Travel blogger & photographer 📸. Exploring the world one city at a time.',
    location: 'New York, NY',
    profilePicture: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150',
    coverPhoto: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800'
  }
];

const seedDatabase = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected! Cleaning existing collections...');

    // Clear existing data
    await User.deleteMany({});
    await Post.deleteMany({});
    await Comment.deleteMany({});
    await Notification.deleteMany({});

    console.log('Hashing passwords and creating users...');
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('password123', salt);

    const createdUsers = [];
    for (const u of usersData) {
      const user = await User.create({
        ...u,
        passwordHash
      });
      createdUsers.push(user);
    }
    console.log(`Created ${createdUsers.length} users successfully.`);

    // Set up following relationships
    const [alice, bob, charlie] = createdUsers;
    
    // Alice follows Bob
    alice.following.push(bob._id);
    bob.followers.push(alice._id);

    // Bob follows Alice & Charlie
    bob.following.push(alice._id);
    alice.followers.push(bob._id);
    
    bob.following.push(charlie._id);
    charlie.followers.push(bob._id);

    // Charlie follows Alice
    charlie.following.push(alice._id);
    alice.followers.push(charlie._id);

    await alice.save();
    await bob.save();
    await charlie.save();
    console.log('Following relationships established.');

    console.log('Seeding posts...');
    const posts = [
      {
        author: alice._id,
        content: 'Hello ConnectHub! 🚀 Just set up my profile. Looking forward to sharing my art creations here! Here is a sample gradient image.',
        imageUrl: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=800',
        likes: [bob._id]
      },
      {
        author: bob._id,
        content: 'Excited to check out this new platform! Setting up Node.js and Mongoose database relationships is always satisfying. 💻✨ #development #connecthub',
        imageUrl: '',
        likes: [alice._id, charlie._id]
      },
      {
        author: charlie._id,
        content: 'Just arrived in Kyoto! The temples are breathtaking 🇯🇵⛩️. Sharing a beautiful photo.',
        imageUrl: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800',
        likes: [bob._id]
      }
    ];

    const createdPosts = await Post.insertMany(posts);
    console.log(`Created ${createdPosts.length} posts successfully.`);

    console.log('Seeding comments...');
    // Bob comments on Alice's post
    await Comment.create({
      post: createdPosts[0]._id,
      author: bob._id,
      content: 'Welcome Alice! The gradient art looks absolutely stunning.'
    });

    // Alice comments on Bob's post
    await Comment.create({
      post: createdPosts[1]._id,
      author: alice._id,
      content: 'Awesome to see backend developers here! Looking forward to your tech posts.'
    });

    // Charlie comments on Bob's post
    await Comment.create({
      post: createdPosts[1]._id,
      author: charlie._id,
      content: 'Completely agree, clean backend code is art in itself.'
    });

    console.log('Database seeded successfully!');
    mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
};

seedDatabase();
