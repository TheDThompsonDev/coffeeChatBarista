import { SIGNUP_WINDOW } from '../config.js';

const CENTRAL_TIMEZONE = 'America/Chicago';
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function normalizeIntegerInRange(value, minimumValue, maximumValue) {
  const parsedNumber = Number(value);
  if (!Number.isInteger(parsedNumber)) return null;
  if (parsedNumber < minimumValue || parsedNumber > maximumValue) return null;
  return parsedNumber;
}

export function getCentralTimeNow() {
  const currentTime = new Date();
  return new Date(currentTime.toLocaleString('en-US', { timeZone: CENTRAL_TIMEZONE }));
}

export function getResolvedSignupWindow(scheduleSource = null) {
  const source = scheduleSource || {};

  const defaultDayOfWeek = SIGNUP_WINDOW.dayOfWeek;
  const defaultStartHour = SIGNUP_WINDOW.startHour;
  const defaultEndHour = SIGNUP_WINDOW.endHour;

  const resolvedDayOfWeek =
    normalizeIntegerInRange(source.signup_day_of_week ?? source.dayOfWeek, 0, 6) ?? defaultDayOfWeek;
  const resolvedStartHour =
    normalizeIntegerInRange(source.signup_start_hour ?? source.startHour, 0, 23) ?? defaultStartHour;

  let resolvedEndHour =
    normalizeIntegerInRange(source.signup_end_hour ?? source.endHour, 1, 23) ?? defaultEndHour;

  // Keep window valid even if stale/invalid data exists.
  if (resolvedEndHour <= resolvedStartHour) {
    resolvedEndHour = defaultEndHour > resolvedStartHour ? defaultEndHour : Math.min(23, resolvedStartHour + 1);
  }

  return {
    dayOfWeek: resolvedDayOfWeek,
    startHour: resolvedStartHour,
    endHour: resolvedEndHour
  };
}

export function isSignupWindowOpen(scheduleSource = null) {
  const centralTime = getCentralTimeNow();
  const dayOfWeek = centralTime.getDay();
  const hourOfDay = centralTime.getHours();
  const signupWindow = getResolvedSignupWindow(scheduleSource);

  if (dayOfWeek !== signupWindow.dayOfWeek) {
    return false;
  }

  return hourOfDay >= signupWindow.startHour && hourOfDay < signupWindow.endHour;
}

export function getCurrentWeekStart() {
  const centralTime = getCentralTimeNow();
  const dayOfWeek = centralTime.getDay();
  const daysToSubtractToGetMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  centralTime.setDate(centralTime.getDate() - daysToSubtractToGetMonday);
  centralTime.setHours(0, 0, 0, 0);

  return centralTime;
}

export function getWeeksAgo(numberOfWeeks) {
  const dateWeeksAgo = new Date();
  dateWeeksAgo.setDate(dateWeeksAgo.getDate() - (numberOfWeeks * 7));
  return dateWeeksAgo;
}

export function addWeeks(startDate, numberOfWeeks) {
  const dateWithWeeksAdded = new Date(startDate);
  dateWithWeeksAdded.setDate(dateWithWeeksAdded.getDate() + (numberOfWeeks * 7));
  return dateWithWeeksAdded;
}

export function formatDate(dateToFormat) {
  return new Date(dateToFormat).toLocaleDateString('en-US', {
    timeZone: CENTRAL_TIMEZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

export function formatHour(hour24) {
  const hour12 = hour24 > 12 ? hour24 - 12 : hour24;
  const amPm = hour24 >= 12 ? 'PM' : 'AM';
  return `${hour12}:00 ${amPm}`;
}

export function getSignupWindowDescription(scheduleSource = null) {
  const signupWindow = getResolvedSignupWindow(scheduleSource);
  const dayName = DAY_NAMES[signupWindow.dayOfWeek];
  const startTime = formatHour(signupWindow.startHour);
  const endTime = formatHour(signupWindow.endHour);
  return `${dayName} from ${startTime} to ${endTime} CT`;
}

