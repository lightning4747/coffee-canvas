// Room Service Entry Point
// TODO: Implement Room Service with GraphQL API

console.log('Room Service starting...');

const PORT = process.env.PORT || 3002;

// Placeholder for Room Service implementation
// This will be implemented in later tasks

process.on('SIGTERM', () => {
  console.log('Room Service shutting down...');
  process.exit(0);
});