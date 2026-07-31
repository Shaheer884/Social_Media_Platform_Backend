const User = require('../../models/User');
const Post = require('../../models/Post');
const Comment = require('../../models/Comment');
const Story = require('../../models/Story');
const Report = require('../models/Report');

const getDashboardStats = async () => {
  // Counts
  const totalUsers = await User.countDocuments({ isDeleted: false, role: { $ne: 'admin' } });
  
  // Active users: logged in last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const activeUsers = await User.countDocuments({ 
    isDeleted: false, 
    role: { $ne: 'admin' }, 
    $or: [{ lastLogin: { $gte: thirtyDaysAgo } }, { createdAt: { $gte: thirtyDaysAgo } }] 
  });
  
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const newUsersToday = await User.countDocuments({ createdAt: { $gte: startOfToday }, isDeleted: false, role: { $ne: 'admin' } });
  
  const totalPosts = await Post.countDocuments({ isDeleted: false });
  const totalComments = await Comment.countDocuments({ isDeleted: false });
  
  // Total likes
  const postsForLikes = await Post.find({ isDeleted: false }).select('likes');
  const totalLikes = postsForLikes.reduce((acc, curr) => acc + (curr.likes ? curr.likes.length : 0), 0);
  
  const totalStories = await Story.countDocuments();
  
  // Saved posts
  const usersForSaved = await User.find({ isDeleted: false }).select('savedPosts');
  const totalSavedPosts = usersForSaved.reduce((acc, curr) => acc + (curr.savedPosts ? curr.savedPosts.length : 0), 0);
  
  const totalReports = await Report.countDocuments();
  const deletedPosts = await Post.countDocuments({ isDeleted: true });
  const deletedComments = await Comment.countDocuments({ isDeleted: true });

  // 1. Monthly User Growth
  const monthlyUserGrowth = [];
  // 2. Monthly Posts
  const monthlyPosts = [];
  
  const date = new Date();
  for (let i = 0; i < 6; i++) {
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
    const monthName = startOfMonth.toLocaleString('default', { month: 'short' });
    
    const userCount = await User.countDocuments({ createdAt: { $lte: endOfMonth }, isDeleted: false, role: { $ne: 'admin' } });
    const postCount = await Post.countDocuments({ createdAt: { $gte: startOfMonth, $lte: endOfMonth }, isDeleted: false });
    
    monthlyUserGrowth.push({ month: monthName, count: userCount });
    monthlyPosts.push({ month: monthName, count: postCount });
    
    date.setMonth(date.getMonth() - 1);
  }
  monthlyUserGrowth.reverse();
  monthlyPosts.reverse();

  // 3. Daily Active Users (last 7 days active)
  const dailyActiveUsers = [];
  const dayDate = new Date();
  for (let i = 0; i < 7; i++) {
    const startOfDay = new Date(dayDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(dayDate);
    endOfDay.setHours(23, 59, 59, 999);
    const dayName = startOfDay.toLocaleString('default', { weekday: 'short' });
    
    const count = await User.countDocuments({ 
      isDeleted: false, 
      role: { $ne: 'admin' },
      $or: [
        { lastLogin: { $gte: startOfDay, $lte: endOfDay } },
        { createdAt: { $gte: startOfDay, $lte: endOfDay } }
      ]
    });
    
    dailyActiveUsers.push({ day: dayName, count: Math.max(count, 1) });
    dayDate.setDate(dayDate.getDate() - 1);
  }
  dailyActiveUsers.reverse();

  // 4. Weekly Engagement (likes + comments)
  const weeklyEngagement = [];
  const weekDate = new Date();
  for (let i = 0; i < 7; i++) {
    const startOfDay = new Date(weekDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(weekDate);
    endOfDay.setHours(23, 59, 59, 999);
    const dayName = startOfDay.toLocaleString('default', { weekday: 'short' });
    
    const commentsCount = await Comment.countDocuments({ createdAt: { $gte: startOfDay, $lte: endOfDay }, isDeleted: false });
    const postsInDay = await Post.find({ createdAt: { $gte: startOfDay, $lte: endOfDay }, isDeleted: false }).select('likes');
    const likesCount = postsInDay.reduce((acc, curr) => acc + (curr.likes ? curr.likes.length : 0), 0);
    
    weeklyEngagement.push({ day: dayName, engagement: likesCount + commentsCount });
    weekDate.setDate(weekDate.getDate() - 1);
  }
  weeklyEngagement.reverse();

  // 5. Trending Hashtags
  const posts = await Post.find({ isDeleted: false, isHidden: false }).select('content');
  const hashtagMap = {};
  posts.forEach(post => {
    const text = post.content || '';
    const tags = text.match(/#\w+/g);
    if (tags) {
      tags.forEach(tag => {
        const cleanTag = tag.toLowerCase();
        hashtagMap[cleanTag] = (hashtagMap[cleanTag] || 0) + 1;
      });
    }
  });
  const trendingHashtags = Object.keys(hashtagMap)
    .map(tag => ({ hashtag: tag, count: hashtagMap[tag] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    cards: {
      totalUsers,
      activeUsers: Math.max(activeUsers, 1),
      newUsersToday,
      totalPosts,
      totalComments,
      totalLikes,
      totalStories,
      totalSavedPosts,
      totalReports,
      deletedPosts,
      deletedComments
    },
    charts: {
      monthlyUserGrowth,
      monthlyPosts,
      dailyActiveUsers,
      weeklyEngagement,
      trendingHashtags
    }
  };
};

module.exports = {
  getDashboardStats
};
