// Jest test setup file
// This file is run before each test file

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key';
process.env.DATABASE_URL =
  'postgresql://postgres:password@localhost:5432/coffeecanvas_test';

// Increase timeout for database operations in tests
jest.setTimeout(10000);
