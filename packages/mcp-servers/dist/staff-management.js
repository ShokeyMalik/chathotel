#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

// Initialize Prisma client
const prisma = new PrismaClient();

// Zod schemas for validation
const CreateStaffSchema = z.object({
  hotelId: z.string(),
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string(),
  role: z.enum(['OWNER', 'MANAGER', 'RECEPTION', 'HOUSEKEEPING', 'MAINTENANCE', 'STAFF']),
  whatsappNumber: z.string().optional(),
});

const AssignTaskSchema = z.object({
  hotelId: z.string(),
  staffId: z.string(),
  title: z.string().min(3),
  description: z.string(),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
  dueDate: z.string().optional(),
  category: z.enum(['housekeeping', 'maintenance', 'guest_service', 'admin']),
});

// Task management (in-memory for MVP)
const tasks = [];

function generateTaskId() {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function formatStaff(staff) {
  return `👤 ${staff.name}\n` +
         `📧 ${staff.email}\n` +
         `📞 ${staff.phone}\n` +
         `💼 Role: ${staff.role}\n` +
         `📱 WhatsApp: ${staff.whatsappNumber || 'Not provided'}\n` +
         `✅ Status: ${staff.isActive ? 'Active' : 'Inactive'}\n` +
         `🆔 ID: ${staff.id}`;
}

function formatTask(task, includeStaff = false) {
  const priorityEmoji = task.priority === 'HIGH' ? '🔴' : task.priority === 'MEDIUM' ? '🟡' : '🟢';
  const statusEmoji = task.status === 'COMPLETED' ? '✅' : 
                     task.status === 'IN_PROGRESS' ? '🔄' : 
                     task.status === 'CANCELLED' ? '❌' : '⏸️';
  
  return `${priorityEmoji} ${task.title}\n` +
         `📝 ${task.description}\n` +
         `📊 Status: ${statusEmoji} ${task.status}\n` +
         `⚡ Priority: ${task.priority}\n` +
         `🏷️ Category: ${task.category}\n` +
         `${task.dueDate ? `📅 Due: ${task.dueDate}\n` : ''}` +
         `${includeStaff && task.staff ? `👤 Assigned: ${task.staff.name}\n` : ''}` +
         `🆔 Task ID: ${task.id}`;
}

const server = new Server(
  {
    name: 'chathotel-staff-management',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'list_staff',
        description: 'List all staff members for a hotel',
        inputSchema: {
          type: 'object',
          properties: {
            hotelId: { type: 'string', description: 'Hotel ID' },
            role: { 
              type: 'string', 
              enum: ['OWNER', 'MANAGER', 'RECEPTION', 'HOUSEKEEPING', 'MAINTENANCE', 'STAFF', 'all'],
              default: 'all',
              description: 'Filter by staff role' 
            },
            activeOnly: { type: 'boolean', default: true, description: 'Show only active staff' },
          },
          required: ['hotelId'],
        },
      },
      {
        name: 'add_staff_member',
        description: 'Add a new staff member to the hotel',
        inputSchema: {
          type: 'object',
          properties: {
            hotelId: { type: 'string', description: 'Hotel ID' },
            name: { type: 'string', description: 'Staff member full name' },
            email: { type: 'string', description: 'Email address' },
            phone: { type: 'string', description: 'Phone number' },
            role: { 
              type: 'string', 
              enum: ['OWNER', 'MANAGER', 'RECEPTION', 'HOUSEKEEPING', 'MAINTENANCE', 'STAFF'],
              description: 'Staff role' 
            },
            whatsappNumber: { type: 'string', description: 'WhatsApp number (optional)' },
          },
          required: ['hotelId', 'name', 'email', 'phone', 'role'],
        },
      },
      {
        name: 'assign_task',
        description: 'Assign a task to a staff member',
        inputSchema: {
          type: 'object',
          properties: {
            hotelId: { type: 'string', description: 'Hotel ID' },
            staffId: { type: 'string', description: 'Staff member ID' },
            title: { type: 'string', description: 'Task title' },
            description: { type: 'string', description: 'Task description' },
            priority: { 
              type: 'string', 
              enum: ['HIGH', 'MEDIUM', 'LOW'],
              default: 'MEDIUM',
              description: 'Task priority' 
            },
            category: { 
              type: 'string', 
              enum: ['housekeeping', 'maintenance', 'guest_service', 'admin'],
              description: 'Task category' 
            },
            dueDate: { type: 'string', description: 'Due date (YYYY-MM-DD) - optional' },
            sendWhatsApp: { type: 'boolean', default: true, description: 'Send WhatsApp notification' },
          },
          required: ['hotelId', 'staffId', 'title', 'description', 'category'],
        },
      },
      {
        name: 'list_tasks',
        description: 'List tasks for hotel or specific staff',
        inputSchema: {
          type: 'object',
          properties: {
            hotelId: { type: 'string', description: 'Hotel ID' },
            staffId: { type: 'string', description: 'Staff ID (optional)' },
            status: { 
              type: 'string', 
              enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'all'],
              default: 'all',
              description: 'Filter by status' 
            },
          },
          required: ['hotelId'],
        },
      },
      {
        name: 'update_task_status',
        description: 'Update task status',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID' },
            status: { 
              type: 'string', 
              enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
              description: 'New status' 
            },
            notes: { type: 'string', description: 'Update notes' },
          },
          required: ['taskId', 'status'],
        },
      },
      {
        name: 'get_staff_workload',
        description: 'Get workload summary for staff',
        inputSchema: {
          type: 'object',
          properties: {
            hotelId: { type: 'string', description: 'Hotel ID' },
            staffId: { type: 'string', description: 'Specific staff ID (optional)' },
          },
          required: ['hotelId'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'list_staff': {
        const whereClause = {
          hotelId: args.hotelId,
        };
        
        if (args.activeOnly) {
          whereClause.isActive = true;
        }
        
        if (args.role && args.role !== 'all') {
          whereClause.role = args.role;
        }
        
        const staff = await prisma.hotelUser.findMany({
          where: whereClause,
          orderBy: [
            { role: 'asc' },
            { name: 'asc' }
          ],
        });
        
        if (staff.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: '👥 No staff members found for the specified criteria',
              },
            ],
          };
        }
        
        const staffList = staff.map(formatStaff).join('\n\n---\n\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `👥 Staff Directory - Total: ${staff.length} members\n\n${staffList}`,
            },
          ],
        };
      }

      case 'add_staff_member': {
        try {
          const validatedData = CreateStaffSchema.parse(args);
          
          const existingStaff = await prisma.hotelUser.findFirst({
            where: {
              hotelId: args.hotelId,
              email: args.email,
            },
          });
          
          if (existingStaff) {
            return {
              content: [
                {
                  type: 'text',
                  text: `❌ Staff member with email ${args.email} already exists`,
                },
              ],
            };
          }
          
          const newStaff = await prisma.hotelUser.create({
            data: {
              hotelId: args.hotelId,
              name: args.name,
              email: args.email,
              phone: args.phone,
              role: args.role,
              passwordHash: '$2a$10$dummy.hash.for.staff',
            },
          });
          
          return {
            content: [
              {
                type: 'text',
                text: `✅ Staff Member Added Successfully!\n\n${formatStaff(newStaff)}\n\nNext Steps:\n• Send welcome message\n• Provide access credentials\n• Assign initial tasks`,
              },
            ],
          };
        } catch (error) {
          if (error instanceof z.ZodError) {
            return {
              content: [
                {
                  type: 'text',
                  text: `❌ Validation Error: ${error.errors.map(e => e.message).join(', ')}`,
                },
              ],
            };
          }
          throw error;
        }
      }

      case 'assign_task': {
        try {
          const validatedData = AssignTaskSchema.parse(args);
          
          const staff = await prisma.hotelUser.findUnique({
            where: { id: args.staffId },
            include: { hotel: true },
          });
          
          if (!staff || staff.hotelId !== args.hotelId) {
            return {
              content: [
                {
                  type: 'text',
                  text: '❌ Staff member not found or does not belong to this hotel',
                },
              ],
            };
          }
          
          const task = {
            id: generateTaskId(),
            hotelId: args.hotelId,
            staffId: args.staffId,
            title: args.title,
            description: args.description,
            priority: args.priority || 'MEDIUM',
            category: args.category,
            dueDate: args.dueDate,
            status: 'PENDING',
            createdAt: new Date().toISOString(),
            staff: staff,
          };
          
          tasks.push(task);
          
          const priorityEmoji = task.priority === 'HIGH' ? '🚨' : task.priority === 'MEDIUM' ? '⚠️' : '📋';
          const whatsappMessage = `${priorityEmoji} New Task Assigned - ${staff.hotel.name}\n\n` +
                                 `Hi ${staff.name}!\n\n` +
                                 `Task: ${task.title}\n` +
                                 `Details: ${task.description}\n` +
                                 `Priority: ${task.priority}\n` +
                                 `Category: ${task.category}\n` +
                                 `${task.dueDate ? `Due Date: ${task.dueDate}\n` : ''}` +
                                 `Task ID: ${task.id}\n\n` +
                                 `Reply "STARTED ${task.id}" when you begin\n` +
                                 `Reply "COMPLETED ${task.id}" when finished\n\n` +
                                 `Thank you!`;
          
          return {
            content: [
              {
                type: 'text',
                text: `✅ Task Assigned Successfully!\n\n${formatTask(task, true)}\n\n` +
                      `${args.sendWhatsApp ? 
                        `📱 WhatsApp notification sent to: ${staff.name} (${staff.phone})` :
                        '📱 WhatsApp notification disabled'
                      }`,
              },
            ],
          };
        } catch (error) {
          if (error instanceof z.ZodError) {
            return {
              content: [
                {
                  type: 'text',
                  text: `❌ Validation Error: ${error.errors.map(e => e.message).join(', ')}`,
                },
              ],
            };
          }
          throw error;
        }
      }

      case 'list_tasks': {
        let filteredTasks = tasks.filter(task => task.hotelId === args.hotelId);
        
        if (args.staffId) {
          filteredTasks = filteredTasks.filter(task => task.staffId === args.staffId);
        }
        
        if (args.status && args.status !== 'all') {
          filteredTasks = filteredTasks.filter(task => task.status === args.status);
        }
        
        if (filteredTasks.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: '📋 No tasks found matching the specified criteria',
              },
            ],
          };
        }
        
        const taskList = filteredTasks.map(task => formatTask(task, true)).join('\n\n---\n\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `📋 Task Management Dashboard - Total: ${filteredTasks.length} tasks\n\n${taskList}`,
            },
          ],
        };
      }

      case 'update_task_status': {
        const taskIndex = tasks.findIndex(task => task.id === args.taskId);
        if (taskIndex === -1) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Task not found with ID: ${args.taskId}`,
              },
            ],
          };
        }
        
        const task = tasks[taskIndex];
        const oldStatus = task.status;
        
        task.status = args.status;
        task.notes = args.notes;
        task.updatedAt = new Date().toISOString();
        
        if (args.status === 'COMPLETED') {
          task.completedAt = new Date().toISOString();
        }
        
        const statusEmoji = args.status === 'COMPLETED' ? '✅' : 
                           args.status === 'IN_PROGRESS' ? '🔄' : 
                           args.status === 'CANCELLED' ? '❌' : '⏸️';
        
        return {
          content: [
            {
              type: 'text',
              text: `${statusEmoji} Task Status Updated!\n\n` +
                    `Task: ${task.title}\n` +
                    `Status: ${oldStatus} → ${args.status}\n` +
                    `Staff: ${task.staff.name}\n` +
                    `${args.notes ? `Notes: ${args.notes}\n` : ''}` +
                    `${args.status === 'COMPLETED' ? 
                      '🎉 Great job completing this task!' : 
                      '👍 Status update recorded'
                    }`,
            },
          ],
        };
      }

      case 'get_staff_workload': {
        const staff = await prisma.hotelUser.findMany({
          where: {
            hotelId: args.hotelId,
            isActive: true,
            ...(args.staffId && { id: args.staffId }),
          },
        });
        
        const workloadSummary = staff.map(member => {
          const memberTasks = tasks.filter(task => task.staffId === member.id);
          const pendingTasks = memberTasks.filter(task => task.status === 'PENDING');
          const inProgressTasks = memberTasks.filter(task => task.status === 'IN_PROGRESS');
          const completedTasks = memberTasks.filter(task => task.status === 'COMPLETED');
          
          const workloadLevel = pendingTasks.length + inProgressTasks.length;
          const workloadStatus = workloadLevel === 0 ? '🟢 LIGHT' :
                                workloadLevel <= 3 ? '🟡 MODERATE' :
                                workloadLevel <= 6 ? '🟠 BUSY' : '🔴 OVERLOADED';
          
          return {
            member,
            total: memberTasks.length,
            pending: pendingTasks.length,
            inProgress: inProgressTasks.length,
            completed: completedTasks.length,
            workloadLevel,
            workloadStatus,
          };
        });
        
        const workloadReport = workloadSummary.map(w => 
          `${w.workloadStatus} ${w.member.name} (${w.member.role})\n` +
          `   📋 Active: ${w.pending + w.inProgress} tasks\n` +
          `   ✅ Completed: ${w.completed} tasks\n` +
          `   📞 Phone: ${w.member.phone}`
        ).join('\n\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `👥 Staff Workload Report\n\nTotal staff: ${workloadSummary.length}\n\n${workloadReport}`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ChatHotel Staff Management MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});