const getPastMonths = (count = 6) => {
  const months = [];
  const date = new Date();
  for (let i = 0; i < count; i++) {
    months.push({
      year: date.getFullYear(),
      month: date.getMonth(), // 0-indexed
      name: date.toLocaleString('default', { month: 'short' })
    });
    date.setMonth(date.getMonth() - 1);
  }
  return months.reverse();
};

const extractHashtags = (text) => {
  if (!text) return [];
  const matches = text.match(/#\w+/g);
  return matches ? matches.map(h => h.toLowerCase()) : [];
};

module.exports = {
  getPastMonths,
  extractHashtags
};
