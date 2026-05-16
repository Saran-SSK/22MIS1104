const STACKS = Object.freeze([
  'backend',
  'frontend',
]);
const LEVELS = Object.freeze([
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
]);
const BACKEND_PACKAGES = Object.freeze([
  'cache',
  'controller',
  'cron_job',
  'db',
  'domain',
  'handler',
  'repository',
  'route',
  'service',
]);
const FRONTEND_PACKAGES = Object.freeze([
  'api',
  'component',
  'hook',
  'page',
  'state',
  'style',
]);

const COMMON_PACKAGES = Object.freeze([
  'auth',
  'config',
  'middleware',
  'utils',
]);

module.exports = {
  STACKS,
  LEVELS,
  BACKEND_PACKAGES,
  FRONTEND_PACKAGES,
  COMMON_PACKAGES,
};
