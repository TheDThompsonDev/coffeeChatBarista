import { SIGNUP_WINDOW } from '../config.js';

export function isSignupWindowOpen() {
  const currentTime = new Date();
  const centralTime = new Date(currentTime.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const dayOfWeek = centralTime.getDay();
  const hourOfDay = centralTime.getHours();
  
  if (dayOfWeek !== SIGNUP_WINDOW.dayOfWeek) {
    return false;
  }
  
  return hourOfDay >= SIGNUP_WINDOW.startHour && hourOfDay < SIGNUP_WINDOW.endHour;
}

export function getCurrentWeekStart() {
  const currentTime = new Date();
  const centralTime = new Date(currentTime.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
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
    timeZone: 'America/Chicago',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

