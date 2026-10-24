import { uid } from './util'

export const ACCOUNT_TYPES = [
  { id: 'savings', label: 'Savings', emoji: '🏦' },
  { id: 'wallet', label: 'Wallet', emoji: '👛' },
  { id: 'cash', label: 'Cash', emoji: '💵' },
  { id: 'investment', label: 'Investment', emoji: '📈' },
  { id: 'credit', label: 'Credit card', emoji: '💳' },
  { id: 'other', label: 'Other', emoji: '🧾' },
]

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'AUD', 'CAD', 'SGD', 'JPY', 'LKR', 'NPR', 'EUR']
  .filter((c, i, a) => a.indexOf(c) === i)

export const COLORS = ['#14b8a6', '#06b6d4', '#22c55e', '#84cc16', '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#6366f1', '#3b82f6', '#64748b']

export const EMOJIS = [
  '🍔', '🛒', '🚌', '⛽', '🏠', '💡', '📱', '🎬', '🎁', '👕', '💊', '🏥', '📚', '✈️', '☕', '🍿',
  '🐶', '🧴', '🔧', '💼', '💰', '🏆', '📈', '🏦', '🎓', '👶', '🏋️', '🎮', '🧾', '🪙', '💸', '🌱',
]

const cat = (type, name, icon, color) => ({ id: uid(), type, name, icon, color })

export const defaultCategories = () => [
  cat('income', 'Salary', '💼', '#14b8a6'),
  cat('income', 'Business', '📈', '#06b6d4'),
  cat('income', 'Gifts', '🎁', '#ec4899'),
  cat('income', 'Interest', '🏦', '#22c55e'),
  cat('income', 'Other income', '💰', '#64748b'),
  cat('expense', 'Food & Dining', '🍔', '#f97316'),
  cat('expense', 'Groceries', '🛒', '#22c55e'),
  cat('expense', 'Transport', '🚌', '#3b82f6'),
  cat('expense', 'Fuel', '⛽', '#f59e0b'),
  cat('expense', 'Rent & Housing', '🏠', '#6366f1'),
  cat('expense', 'Bills & Utilities', '💡', '#eab308'),
  cat('expense', 'Shopping', '👕', '#ec4899'),
  cat('expense', 'Entertainment', '🎬', '#a855f7'),
  cat('expense', 'Health', '💊', '#ef4444'),
  cat('expense', 'Education', '📚', '#06b6d4'),
  cat('expense', 'Travel', '✈️', '#14b8a6'),
  cat('expense', 'Other', '🧾', '#64748b'),
]

export const defaultAccounts = () => [
  { id: uid(), name: 'Cash', type: 'cash', balance: 0, color: '#22c55e' },
  { id: uid(), name: 'Bank account', type: 'savings', balance: 0, color: '#06b6d4' },
]

export const defaultSettings = () => ({
  currency: 'INR',
  dailyReminder: false,
  dailyReminderTime: '20:00',
  showEmi: false,
  showReminders: false,
})

export const emptyData = () => ({
  version: 1,
  updatedAt: 0,
  accounts: defaultAccounts(),
  categories: defaultCategories(),
  transactions: [],
  budgets: [],
  reminders: [],
  emis: [],
  settings: defaultSettings(),
  pin: null, // { salt, hash }
})
