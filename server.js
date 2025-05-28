const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🚀 ChatHotel Production Server Starting...');

async function setupPrisma() {
  try {
    console.log('🔧 Setting up Prisma...');
    
    // Check if schema exists
    const schemaPath = path.join(__dirname, 'schema.prisma');
    if (!fs.existsSync(schemaPath)) {
      console.log('📋 Creating schema.prisma in root...');
      const dbSchemaPath = path.join(__dirname, 'packages/database/prisma/schema.prisma');
      if (fs.existsSync(dbSchemaPath)) {
        fs.copyFileSync(dbSchemaPath, schemaPath);
        console.log('✅ Schema copied to root');
      } else {
        throw new Error('Schema file not found');
      }
    }
    
    // Generate Prisma client with force
    console.log('🔧 Generating Prisma client...');
    execSync('npx prisma generate --schema=schema.prisma', { 
      stdio: 'inherit',
      cwd: __dirname 
    });
    console.log('✅ Prisma client generated');
    
    // Wait for generation to complete
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    return true;
  } catch (error) {
    console.error('❌ Prisma setup failed:', error);
    return false;
  }
}

async function startServer() {
  // Setup Prisma first
  const prismaReady = await setupPrisma();
  
  if (!prismaReady) {
    console.log('⚠️ Prisma not ready, starting simple HTTP server only');
  }
  
  // Create HTTP server for hosting platform
  const http = require('http');
  
  const server = http.createServer(async (req, res) => {
    const url = req.url;
    
    if (url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        prisma: prismaReady ? 'ready' : 'not ready'
      }));
      return;
    }
    
    if (url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        service: 'ChatHotel MCP Servers',
        status: 'running',
        timestamp: new Date().toISOString(),
        message: 'Hotel management system is operational',
        endpoints: {
          health: '/health',
          status: '/'
        },
        version: '1.0.0'
      }));
      return;
    }
    
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });
  
  const PORT = process.env.PORT || 3000;
  
  server.listen(PORT, () => {
    console.log(`🎉 ChatHotel server running on port ${PORT}`);
    console.log(`🌐 Health check: http://localhost:${PORT}/health`);
    console.log('🏨 MCP servers ready for integration');
  });
  
  // Keep process alive
  process.on('SIGTERM', () => {
    console.log('👋 Shutting down gracefully...');
    server.close(() => {
      process.exit(0);
    });
  });
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the server
startServer().catch(error => {
  console.error('💥 Failed to start server:', error);
  process.exit(1);
});