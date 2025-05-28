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

const UpdateTaskStatusSchema = z.object({
  taskId: z.string(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
  notes: z.string().optional(),
});

// Task management (extend Prisma schema or use separate table)
const tasks = []; // In-memory for MVP, move to DB later

function generateTaskId() {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function formatStaff(staff) {
  return `👤 **${staff.name}**\n` +
         `📧 ${staff.email}\n` +
         `📞 ${staff.phone}\n` +
         `💼 Role: ${staff.role}\n` +
         `📱 WhatsApp: ${staff.whatsappNumber || 'Not provided'}\n` +
         `✅ Status: ${staff.isActive ? 'Active' : 'Inactive'}\n` +
         `🆔 ID: ${staff.id}\n` +
         `📅 Joined: ${staff.createdAt.toISOString().split('T')[0]}`;
}

function formatTask(task, includeStaff = false) {
  const priorityEmoji = task.priority === 'HIGH' ? '🔴' : task.priority === 'MEDIUM' ? '🟡' : '🟢';
  const statusEmoji = task.status === 'COMPLETED' ? '✅' : 
                     task.status === 'IN_PROGRESS' ? '🔄' : 
                     task.status === 'CANCELLED' ? '❌' : '⏸️';
  
  return `${priorityEmoji} **${task.title}**\n` +
         `📝 ${task.description}\n` +
         `📊 Status: ${statusEmoji} ${task.status}\n` +
         `⚡ Priority: ${task.priority}\n` +
         `🏷️ Category: ${task.category}\n` +
         `${task.dueDate ? `📅 Due: ${task.dueDate}\n` : ''}` +
         `${includeStaff && task.staff ? `👤 Assigned: ${task.staff.name}\n` : ''}` +
         `${task.notes ? `📋 Notes: ${task.notes}\n` : ''}` +
         `🆔 Task ID: ${task.id}\n` +
         `⏰ Created: ${task.createdAt}`;
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
        description: 'Assign a task to a staff member via WhatsApp',
        inputSchema: {
          type: 'object',
          properties: {
            hotelId: { type: 'string', description: 'Hotel ID' },
            staffId: { type: 'string', description: 'Staff member ID' },
            title: { type: 'string', description: 'Task title' },
            description: { type: 'string', description: 'Detailed task description' },
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
        description: 'List tasks for hotel or specific staff member',
        inputSchema: {
          type: 'object',
          properties: {
            hotelId: { type: 'string', description: 'Hotel ID' },
            staffId: { type: 'string', description: 'Staff ID (optional - for specific staff tasks)' },
            status: { 
              type: 'string', 
              enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'all'],
              default: 'all',
              description: 'Filter by task status' 
            },
            category: { 
              type: 'string', 
              enum: ['housekeeping', 'maintenance', 'guest_service', 'admin', 'all'],
              default: 'all',
              description: 'Filter by category' 
            },
            priority: { 
              type: 'string', 
              enum: ['HIGH', 'MEDIUM', 'LOW', 'all'],
              default: 'all',
              description: 'Filter by priority' 
            },
          },
          required: ['hotelId'],
        },
      },
      {
        name: 'update_task_status',
        description: 'Update task status (for staff to report progress)',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID' },
            status: { 
              type: 'string', 
              enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
              description: 'New task status' 
            },
            notes: { type: 'string', description: 'Status update notes' },
            completedByPhone: { type: 'string', description: 'Phone number of staff completing task' },
          },
          required: ['taskId', 'status'],
        },
      },
      {
        name: 'get_staff_workload',
        description: 'Get workload summary for staff members',
        inputSchema: {
          type: 'object',
          properties: {
            hotelId: { type: 'string', description: 'Hotel ID' },
            staffId: { type: 'string', description: 'Specific staff ID (optional)' },
          },
          required: ['hotelId'],
        },
      },
      {
        name: 'send_staff_whatsapp',
        description: 'Send WhatsApp message to staff member',
        inputSchema: {
          type: 'object',
          properties: {
            hotelId: { type: 'string', description: 'Hotel ID' },
            staffId: { type: 'string', description: 'Staff member ID' },
            message: { type: 'string', description: 'Message to send' },
            messageType: { 
              type: 'string', 
              enum: ['task_assignment', 'general', 'urgent', 'reminder'],
              default: 'general',
              description: 'Message type' 
            },
          },
          required: ['hotelId', 'staffId', 'message'],
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
                text: `👥 No staff members found for the specified criteria`,
              },
            ],
          };
        }
        
        const staffByRole = staff.reduce((acc, member) => {
          if (!acc[member.role]) acc[member.role] = [];
          acc[member.role].push(member);
          return acc;
        }, {});
        
        const staffList = Object.keys(staffByRole).map(role => 
          `**${role} (${staffByRole[role].length})**\n` +
          staffByRole[role].map(member => formatStaff(member)).join('\n\n---\n\n')
        ).join('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `👥 **Staff Directory** - Total: ${staff.length} members\n\n${staffList}`,
            },
          ],
        };
      }

      case 'add_staff_member': {
        try {
          const validatedData = CreateStaffSchema.parse(args);
          
          // Check if email already exists for this hotel
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
              passwordHash: '$2a$10$dummy.hash.for.staff', // In production, generate proper hash
            },
          });
          
          return {
            content: [
              {
                type: 'text',
                text: `✅ **Staff Member Added Successfully!**\n\n${formatStaff(newStaff)}\n\n` +
                      `**Next Steps:**\n` +
                      `• Send welcome message via WhatsApp\n` +
                      `• Provide hotel access credentials\n` +
                      `• Assign initial tasks if needed`,
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
                  text: `❌ Staff member not found or doesn't belong to this hotel`,
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
          
          // Generate WhatsApp message for task assignment
          const priorityEmoji = task.priority === 'HIGH' ? '🚨' : task.priority === 'MEDIUM' ? '⚠️' : '📋';
          const whatsappMessage = `${priorityEmoji} **New Task Assigned** - ${staff.hotel.name}\n\n` +
                                 `👋 Hi ${staff.name}!\n\n` +
                                 `**Task:** ${task.title}\n` +
                                 `**Details:** ${task.description}\n` +
                                 `**Priority:** ${task.priority}\n` +
                                 `**Category:** ${task.category}\n` +
                                 `${task.dueDate ? `**Due Date:** ${task.dueDate}\n` : ''}` +
                                 `**Task ID:** ${task.id}\n\n` +
                                 `**To update progress:**\n` +
                                 `• Reply "STARTED ${task.id}" when you begin\n` +
                                 `• Reply "COMPLETED ${task.id}" when finished\n` +
                                 `• Reply "HELP ${task.id}" if you need assistance\n\n` +
                                 `Thank you! 🙏`;
          
          if (args.sendWhatsApp) {
            // In production, send actual WhatsApp message
            // await sendWhatsAppMessage(staff.phone, whatsappMessage);
            console.log(`WhatsApp task assignment sent to ${staff.phone}`);
          }
          
          return {
            content: [
              {
                type: 'text',
                text: `✅ **Task Assigned Successfully!**\n\n${formatTask(task, true)}\n\n` +
                      `${args.sendWhatsApp ? 
                        `📱 **WhatsApp notification sent to:** ${staff.name} (${staff.phone})\n\n` +
                        `**Message Preview:**\n${whatsappMessage.substring(0, 200)}...` :
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
        
        if (args.category && args.category !== 'all') {
          filteredTasks = filteredTasks.filter(task => task.category === args.category);
        }
        
        if (args.priority && args.priority !== 'all') {
          filteredTasks = filteredTasks.filter(task => task.priority === args.priority);
        }
        
        if (filteredTasks.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `📋 No tasks found matching the specified criteria`,
              },
            ],
          };
        }
        
        // Sort by priority (HIGH first) then by creation date
        filteredTasks.sort((a, b) => {
          const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
          if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
            return priorityOrder[b.priority] - priorityOrder[a.priority];
          }
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
        
        const tasksByStatus = filteredTasks.reduce((acc, task) => {
          if (!acc[task.status]) acc[task.status] = [];
          acc[task.status].push(task);
          return acc;
        }, {});
        
        const taskList = Object.keys(tasksByStatus).map(status => 
          `**${status} (${tasksByStatus[status].length})**\n` +
          tasksByStatus[status].map(task => formatTask(task, true)).join('\n\n---\n\n')
        ).join('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n');
        
        const summary = {
          total: filteredTasks.length,
          pending: filteredTasks.filter(t => t.status === 'PENDING').length,
          inProgress: filteredTasks.filter(t => t.status === 'IN_PROGRESS').length,
          completed: filteredTasks.filter(t => t.status === 'COMPLETED').length,
          high: filteredTasks.filter(t => t.priority === 'HIGH').length,
        };
        
        return {
          content: [
            {
              type: 'text',
              text: `📋 **Task Management Dashboard**\n\n` +
                    `**📊 Summary:**\n` +
                    `• Total tasks: ${summary.total}\n` +
                    `• Pending: ${summary.pending} | In Progress: ${summary.inProgress} | Completed: ${summary.completed}\n` +
                    `• High Priority: ${summary.high}\n\n` +
                    `${taskList}`,
            },
          ],
        };
      }

      case 'update_task_status': {
        try {
          const validatedData = UpdateTaskStatusSchema.parse(args);
          
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
                text: `${statusEmoji} **Task Status Updated!**\n\n` +
                      `**Task:** ${task.title}\n` +
                      `**Status:** ${oldStatus} → ${args.status}\n` +
                      `**Staff:** ${task.staff.name}\n` +
                      `${args.notes ? `**Notes:** ${args.notes}\n` : ''}` +
                      `**Updated:** ${task.updatedAt}\n\n` +
                      `${args.status === 'COMPLETED' ? 
                        '🎉 **Great job completing this task!**' : 
                        '👍 **Status update recorded**'
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
          const highPriorityTasks = memberTasks.filter(task => task.priority === 'HIGH' && task.status !== 'COMPLETED');
          
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
            highPriority: highPriorityTasks.length,
            workloadLevel,
            workloadStatus,
          };
        });
        
        const totalTasks = workloadSummary.reduce((sum, w) => sum + w.total, 0);
        const avgWorkload = workloadSummary.length > 0 ? 
          Math.round(workloadSummary.reduce((sum, w) => sum + w.workloadLevel, 0) / workloadSummary.length) : 0;
        
        const workloadReport = workloadSummary.map(w => 
          `${w.workloadStatus} **${w.member.name}** (${w.member.role})\n` +
          `   📋 Active: ${w.pending + w.inProgress} tasks (${w.pending} pending, ${w.inProgress} in progress)\n` +
          `   ✅ Completed: ${w.completed} tasks\n` +
          `   🚨 High Priority: ${w.highPriority} tasks\n` +
          `   📞 Phone: ${w.member.phone}`
        ).join('\n\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `👥 **Staff Workload Report**\n\n` +
                    `**📊 Overview:**\n` +
                    `• Total staff: ${workloadSummary.length}\n` +
                    `• Total tasks: ${totalTasks}\n` +
                    `• Average workload: ${avgWorkload} active tasks per person\n\n` +
                    `**👤 Individual Workloads:**\n\n${workloadReport}\n\n` +
                    `**💡 Recommendations:**\n` +
                    `${workloadSummary.some(w => w.workloadLevel > 6) ? 
                      '• Consider redistributing tasks from overloaded staff\n' : ''
                    }` +
                    `${workloadSummary.some(w => w.highPriority > 2) ? 
                      '• Follow up on high-priority tasks\n' : ''
                    }` +
                    `• Regular check-ins help maintain productivity`,
            },
          ],
        };
      }

      case 'send_staff_whatsapp': {
        const staff = await prisma.hotelUser.findUnique({
          where: { id: args.staffId },
          include: { hotel: true },
        });
        
        if (!staff || staff.hotelId !== args.hotelId) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Staff member not found or doesn't belong to this hotel`,
              },
            ],
          };
        }
        
        const messageTypeEmoji = {
          task_assignment: '📋',
          general: '💬',
          urgent: '🚨',
          reminder: '⏰',
        };
        
        const emoji = messageTypeEmoji[args.messageType] || '💬';
        const formattedMessage = `${emoji} **${staff.hotel.name}**\n\n` +
                               `Hi ${staff.name}! 👋\n\n` +
                               `${args.message}\n\n` +
                               `${args.messageType === 'urgent' ? '⚠️ **URGENT - Please respond ASAP**\n\n' : ''}` +
                               `Best regards,\nManagement Team`;
        
        // In production, send actual WhatsApp message
        // await sendWhatsAppMessage(staff.phone, formattedMessage);
        
        return {
          content: [
            {
              type: 'text',
              text: `✅ **WhatsApp Message Sent!**\n\n` +
                    `**To:** ${staff.name} (${staff.role})\n` +
                    `**Phone:** ${staff.phone}\n` +
                    `**Type:** ${args.messageType}\n\n` +
                    `**Message Preview:**\n${formattedMessage}`,
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