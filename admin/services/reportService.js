const Report = require('../models/Report');
const User = require('../../models/User');
const Post = require('../../models/Post');
const Comment = require('../../models/Comment');

const createReport = async ({ reporter, targetType, targetId, reason, details }) => {
  return await Report.create({
    reporter,
    targetType,
    targetId,
    reason,
    details
  });
};

const getReports = async (page = 1, limit = 10, status = '', reason = '') => {
  const skip = (page - 1) * limit;
  const filter = {};
  if (status) filter.status = status;
  if (reason) filter.reason = reason;

  const reports = await Report.find(filter)
    .populate('reporter', 'username fullName email profilePicture')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  // Manually populate target details based on targetType
  const reportsWithTarget = await Promise.all(
    reports.map(async (report) => {
      const reportObj = report.toObject();
      let targetDoc = null;
      try {
        if (report.targetType === 'User') {
          targetDoc = await User.findById(report.targetId).select('username fullName email profilePicture isSuspended isDeleted');
        } else if (report.targetType === 'Post') {
          targetDoc = await Post.findById(report.targetId).populate('author', 'username fullName profilePicture');
        } else if (report.targetType === 'Comment') {
          targetDoc = await Comment.findById(report.targetId).populate('author', 'username fullName profilePicture');
        }
      } catch (err) {
        console.error('Error fetching report target doc:', err);
      }
      reportObj.targetDetails = targetDoc;
      return reportObj;
    })
  );

  const total = await Report.countDocuments(filter);
  const pages = Math.ceil(total / limit);

  return {
    reports: reportsWithTarget,
    pagination: {
      page,
      limit,
      totalPages: pages,
      totalReports: total
    }
  };
};

const updateReportStatus = async (reportId, status) => {
  const report = await Report.findById(reportId);
  if (!report) {
    throw new Error('Report not found');
  }
  report.status = status;
  await report.save();
  return report;
};

module.exports = {
  createReport,
  getReports,
  updateReportStatus
};
