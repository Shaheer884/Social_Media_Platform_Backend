const User = require('../../models/User');

const getUsers = async (page = 1, limit = 10, search = '', statusFilter = '') => {
  const skip = (page - 1) * limit;
  const query = { isDeleted: false }; // Show active/suspended, not soft-deleted

  if (search) {
    query.$or = [
      { username: { $regex: search, $options: 'i' } },
      { fullName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }

  if (statusFilter === 'suspended') {
    query.isSuspended = true;
  } else if (statusFilter === 'active') {
    query.isSuspended = false;
  }

  const users = await User.find(query)
    .select('-passwordHash')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await User.countDocuments(query);
  const pages = Math.ceil(total / limit);

  return {
    users,
    pagination: {
      page,
      limit,
      totalPages: pages,
      totalUsers: total
    }
  };
};

const suspendUser = async (id, isSuspended) => {
  const user = await User.findById(id);
  if (!user) throw new Error('User not found');
  
  if (user.role === 'admin') {
    throw new Error('Action Denied: Cannot suspend the Admin account.');
  }

  user.isSuspended = isSuspended;
  await user.save();
  return user;
};

const softDeleteUser = async (id) => {
  const user = await User.findById(id);
  if (!user) throw new Error('User not found');

  if (user.role === 'admin') {
    throw new Error('Action Denied: Cannot delete the Admin account.');
  }

  user.isDeleted = true;
  user.deletedAt = new Date();
  await user.save();
  return user;
};

const restoreUser = async (id) => {
  const user = await User.findById(id);
  if (!user) throw new Error('User not found');
  
  user.isDeleted = false;
  user.deletedAt = null;
  user.isSuspended = false;
  await user.save();
  return user;
};

const permanentDeleteUser = async (id) => {
  const user = await User.findById(id);
  if (!user) throw new Error('User not found');

  if (user.role === 'admin') {
    throw new Error('Action Denied: Cannot delete the Admin account.');
  }

  await User.findByIdAndDelete(id);
  return user;
};

module.exports = {
  getUsers,
  suspendUser,
  softDeleteUser,
  restoreUser,
  permanentDeleteUser
};
