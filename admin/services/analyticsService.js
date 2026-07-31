const User = require('../../models/User');
const Post = require('../../models/Post');
const Comment = require('../../models/Comment');

const getTrendingData = async () => {
  // 1. Most Followed Users
  const mostFollowed = await User.aggregate([
    { $match: { isDeleted: false, role: { $ne: 'admin' } } },
    { $project: { username: 1, fullName: 1, profilePicture: 1, followersCount: { $size: "$followers" } } },
    { $sort: { followersCount: -1 } },
    { $limit: 5 }
  ]);

  // 2. Most Liked Posts
  const mostLikedPosts = await Post.aggregate([
    { $match: { isDeleted: false, isHidden: false } },
    { $project: { author: 1, content: 1, likesCount: { $size: "$likes" }, createdAt: 1 } },
    { $sort: { likesCount: -1 } },
    { $limit: 5 }
  ]);
  await User.populate(mostLikedPosts, { path: 'author', select: 'username fullName profilePicture' });

  // 3. Most Commented Posts
  const mostCommentedPosts = await Comment.aggregate([
    { $match: { isDeleted: false, isHidden: false } },
    { $group: { _id: "$post", commentCount: { $sum: 1 } } },
    { $sort: { commentCount: -1 } },
    { $limit: 5 }
  ]);
  
  const populatedCommentedPosts = await Promise.all(
    mostCommentedPosts.map(async (item) => {
      const post = await Post.findById(item._id)
        .populate('author', 'username fullName profilePicture')
        .select('content author');
      return {
        _id: item._id,
        commentCount: item.commentCount,
        post: post
      };
    })
  );

  // 4. Most Active Users (Post count)
  const mostActivePosters = await Post.aggregate([
    { $match: { isDeleted: false } },
    { $group: { _id: "$author", postCount: { $sum: 1 } } },
    { $sort: { postCount: -1 } },
    { $limit: 5 }
  ]);
  await User.populate(mostActivePosters, { path: '_id', select: 'username fullName profilePicture email' });

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
  const trendingTags = Object.keys(hashtagMap)
    .map(tag => ({ tag, count: hashtagMap[tag] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // 6. Today's quick counts
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const postsCreatedToday = await Post.countDocuments({ createdAt: { $gte: startOfToday }, isDeleted: false });
  const newUsersToday = await User.countDocuments({ createdAt: { $gte: startOfToday }, isDeleted: false });

  // 7. Growth data: weekly and monthly user metrics
  const lastWeek = new Date();
  lastWeek.setDate(lastWeek.getDate() - 7);
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);

  const usersLastWeek = await User.countDocuments({ createdAt: { $gte: lastWeek }, isDeleted: false });
  const usersLastMonth = await User.countDocuments({ createdAt: { $gte: lastMonth }, isDeleted: false });

  const totalUsersCount = await User.countDocuments({ isDeleted: false, role: { $ne: 'admin' } });

  const weeklyGrowth = totalUsersCount > 0 ? ((usersLastWeek / totalUsersCount) * 100).toFixed(1) : 0;
  const monthlyGrowth = totalUsersCount > 0 ? ((usersLastMonth / totalUsersCount) * 100).toFixed(1) : 0;

  return {
    mostFollowed,
    mostLikedPosts,
    mostCommentedPosts: populatedCommentedPosts.filter(p => p.post !== null),
    mostActivePosters,
    trendingTags,
    postsCreatedToday,
    newUsersToday,
    weeklyGrowth,
    monthlyGrowth
  };
};

module.exports = {
  getTrendingData
};
