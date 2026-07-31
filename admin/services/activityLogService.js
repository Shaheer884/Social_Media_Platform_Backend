const ActivityLog = require('../models/ActivityLog');

const logAction = async ({ adminId, adminName, action, target, ipAddress }) => {
  try {
    await ActivityLog.create({
      adminId,
      adminName,
      action,
      target,
      ipAddress: ipAddress || ''
    });
  } catch (error) {
    console.error('Error logging admin action:', error);
  }
};

const getActivityLogs = async (page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  const logs = await ActivityLog.find()
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await ActivityLog.countDocuments();
  const pages = Math.ceil(total / limit);

  return {
    logs,
    pagination: {
      page,
      limit,
      totalPages: pages,
      totalLogs: total
    }
  };
};

module.exports = {
  logAction,
  getActivityLogs
};
