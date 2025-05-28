#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// Hotel schema
const HotelSchema = z.object({
  name: z.string().describe('Hotel name'),
  address: z.string().describe('Hotel address'),
  phone: z.string().describe('Hotel phone number'),
  email: z.string().email().describe('Hotel email address'),
  description: z.string().optional().describe('Hotel description'),
  amenities: z.array(z.string()).default([]).describe('Hotel amenities'),
});

const UpdateHotelSchema = HotelSchema.partial().extend({
  id: z.string().describe('Hotel ID to update'),
});

// Room schema
const RoomSchema = z.object({
  hotelId: z.string().describe('Hotel ID this room belongs to'),
  roomNumber: z.string().describe('Room number'),
  type: z.enum(['single', 'double', 'suite', 'deluxe']).describe('Room type'),
  price: z.number().positive().describe('Room price per night'),
  capacity: z.number().positive().describe('Maximum occupancy'),
  amenities: z.array(z.string()).default([]).describe('Room amenities'),
  description: z.string().optional().describe('Room description'),
});

const UpdateRoomSchema = RoomSchema.partial().extend({
  id: z.string().describe('Room ID to update'),
});

// Booking schema
const BookingSchema = z.object({
  hotelId: z.string().describe('Hotel ID'),
  roomId: z.string().describe('Room ID'),
  guestName: z.string().describe('Guest name'),
  guestEmail: z.string().email().describe('Guest email'),
  guestPhone: z.string().describe('Guest phone number'),
  checkIn: z.string().describe('Check-in date (YYYY-MM-DD)'),
  checkOut: z.string().describe('Check-out date (YYYY-MM-DD)'),
  guests: z.number().positive().describe('Number of guests'),
  specialRequests: z.string().optional().describe('Special requests'),
});

// In-memory storage for demo (replace with database in production)
interface Hotel {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  description?: string;
  amenities: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface Room {
  id: string;
  hotelId: string;
  roomNumber: string;
  type: 'single' | 'double' | 'suite' | 'deluxe';
  price: number;
  capacity: number;
  amenities: string[];
  description?: string;
  isAvailable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface Booking {
  id: string;
  hotelId: string;
  roomId: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  checkIn: Date;
  checkOut: Date;
  guests: number;
  specialRequests?: string;
  status: 'pending' | 'confirmed' | 'checked-in' | 'checked-out' | 'cancelled';
  totalAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

// In-memory storage
const hotels: Hotel[] = [];
const rooms: Room[] = [];
const bookings: Booking[] = [];

const server = new Server(
  {
    name: 'chathotel-hotel-management',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {
        listChanged: true,
      },
    },
  }
);

// Helper functions
function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function formatHotel(hotel: Hotel): string {
  return `🏨 ${hotel.name}\n` +
         `📍 ${hotel.address}\n` +
         `📞 ${hotel.phone}\n` +
         `📧 ${hotel.email}\n` +
         `🆔 ${hotel.id}\n` +
         `🏷️ Amenities: ${hotel.amenities.join(', ') || 'None'}\n` +
         `📝 ${hotel.description || 'No description'}\n` +
         `📅 Created: ${hotel.createdAt.toISOString()}`;
}

function formatRoom(room: Room): string {
  return `🚪 Room ${room.roomNumber}\n` +
         `🏨 Hotel ID: ${room.hotelId}\n` +
         `🛏️ Type: ${room.type}\n` +
         `💰 Price: $${room.price}/night\n` +
         `👥 Capacity: ${room.capacity} guests\n` +
         `✅ Available: ${room.isAvailable ? 'Yes' : 'No'}\n` +
         `🆔 ${room.id}\n` +
         `🏷️ Amenities: ${room.amenities.join(', ') || 'None'}\n` +
         `📝 ${room.description || 'No description'}`;
}

function formatBooking(booking: Booking): string {
  return `📋 Booking ${booking.id}\n` +
         `👤 Guest: ${booking.guestName}\n` +
         `📧 Email: ${booking.guestEmail}\n` +
         `📞 Phone: ${booking.guestPhone}\n` +
         `🏨 Hotel: ${booking.hotelId}\n` +
         `🚪 Room: ${booking.roomId}\n` +
         `📅 Check-in: ${booking.checkIn.toISOString().split('T')[0]}\n` +
         `📅 Check-out: ${booking.checkOut.toISOString().split('T')[0]}\n` +
         `👥 Guests: ${booking.guests}\n` +
         `💰 Total: $${booking.totalAmount}\n` +
         `📊 Status: ${booking.status}\n` +
         `📝 Special requests: ${booking.specialRequests || 'None'}`;
}

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'create_hotel',
        description: 'Create a new hotel',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Hotel name' },
            address: { type: 'string', description: 'Hotel address' },
            phone: { type: 'string', description: 'Hotel phone number' },
            email: { type: 'string', description: 'Hotel email address' },
            description: { type: 'string', description: 'Hotel description' },
            amenities: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Hotel amenities'
            },
          },
          required: ['name', 'address', 'phone', 'email'],
        },
      },
      {
        name: 'get_hotel',
        description: 'Get hotel by ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Hotel ID' },
          },
          required: ['id'],
        },
      },
      {
        name: 'update_hotel',
        description: 'Update hotel information',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Hotel ID to update' },
            name: { type: 'string', description: 'Hotel name' },
            address: { type: 'string', description: 'Hotel address' },
            phone: { type: 'string', description: 'Hotel phone number' },
            email: { type: 'string', description: 'Hotel email address' },
            description: { type: 'string', description: 'Hotel description' },
            amenities: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Hotel amenities'
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'delete_hotel',
        description: 'Delete a hotel',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Hotel ID to delete' },
          },
          required: ['id'],
        },
      },
      {
        name: 'list_hotels',
        description: 'List all hotels',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'create_room',
        description: 'Create a new room',
        inputSchema: {
          type: 'object',
          properties: {
            hotelId: { type: 'string', description: 'Hotel ID this room belongs to' },
            roomNumber: { type: 'string', description: 'Room number' },
            type: { 
              type: 'string', 
              enum: ['single', 'double', 'suite', 'deluxe'],
              description: 'Room type'
            },
            price: { type: 'number', description: 'Room price per night' },
            capacity: { type: 'number', description: 'Maximum occupancy' },
            amenities: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Room amenities'
            },
            description: { type: 'string', description: 'Room description' },
          },
          required: ['hotelId', 'roomNumber', 'type', 'price', 'capacity'],
        },
      },
      {
        name: 'get_room',
        description: 'Get room by ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Room ID' },
          },
          required: ['id'],
        },
      },
      {
        name: 'list_rooms',
        description: 'List rooms for a hotel',
        inputSchema: {
          type: 'object',
          properties: {
            hotelId: { type: 'string', description: 'Hotel ID to list rooms for' },
          },
          required: ['hotelId'],
        },
      },
      {
        name: 'create_booking',
        description: 'Create a new booking',
        inputSchema: {
          type: 'object',
          properties: {
            hotelId: { type: 'string', description: 'Hotel ID' },
            roomId: { type: 'string', description: 'Room ID' },
            guestName: { type: 'string', description: 'Guest name' },
            guestEmail: { type: 'string', description: 'Guest email' },
            guestPhone: { type: 'string', description: 'Guest phone number' },
            checkIn: { type: 'string', description: 'Check-in date (YYYY-MM-DD)' },
            checkOut: { type: 'string', description: 'Check-out date (YYYY-MM-DD)' },
            guests: { type: 'number', description: 'Number of guests' },
            specialRequests: { type: 'string', description: 'Special requests' },
          },
          required: ['hotelId', 'roomId', 'guestName', 'guestEmail', 'guestPhone', 'checkIn', 'checkOut', 'guests'],
        },
      },
      {
        name: 'list_bookings',
        description: 'List bookings for a hotel',
        inputSchema: {
          type: 'object',
          properties: {
            hotelId: { type: 'string', description: 'Hotel ID to list bookings for' },
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
      case 'create_hotel': {
        const hotelData = HotelSchema.parse(args);
        const hotel: Hotel = {
          id: generateId(),
          ...hotelData,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        hotels.push(hotel);
        
        return {
          content: [
            {
              type: 'text',
              text: `✅ Hotel created successfully!\n\n${formatHotel(hotel)}`,
            },
          ],
        };
      }

      case 'get_hotel': {
        const { id } = args as any;
        const hotel = hotels.find(h => h.id === id);
        
        if (!hotel) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Hotel not found with ID: ${id}`,
              },
            ],
          };
        }
        
        return {
          content: [
            {
              type: 'text',
              text: formatHotel(hotel),
            },
          ],
        };
      }

      case 'update_hotel': {
        const updateData = UpdateHotelSchema.parse(args);
        const hotelIndex = hotels.findIndex(h => h.id === updateData.id);
        
        if (hotelIndex === -1) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Hotel not found with ID: ${updateData.id}`,
              },
            ],
          };
        }
        
        const { id, ...updates } = updateData;
        hotels[hotelIndex] = {
          ...hotels[hotelIndex],
          ...updates,
          updatedAt: new Date(),
        };
        
        return {
          content: [
            {
              type: 'text',
              text: `✅ Hotel updated successfully!\n\n${formatHotel(hotels[hotelIndex])}`,
            },
          ],
        };
      }

      case 'delete_hotel': {
        const { id } = args as any;
        const hotelIndex = hotels.findIndex(h => h.id === id);
        
        if (hotelIndex === -1) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Hotel not found with ID: ${id}`,
              },
            ],
          };
        }
        
        const deletedHotel = hotels.splice(hotelIndex, 1)[0];
        
        // Also delete associated rooms and bookings
        const deletedRooms = rooms.filter(r => r.hotelId === id);
        rooms.splice(0, rooms.length, ...rooms.filter(r => r.hotelId !== id));
        bookings.splice(0, bookings.length, ...bookings.filter(b => b.hotelId !== id));
        
        return {
          content: [
            {
              type: 'text',
              text: `✅ Hotel deleted successfully!\n\n` +
                    `🏨 Deleted: ${deletedHotel.name}\n` +
                    `🚪 Rooms deleted: ${deletedRooms.length}\n` +
                    `📋 Bookings deleted: ${bookings.filter(b => b.hotelId === id).length}`,
            },
          ],
        };
      }

      case 'list_hotels': {
        if (hotels.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: '📭 No hotels found. Create your first hotel!',
              },
            ],
          };
        }
        
        const hotelList = hotels.map(formatHotel).join('\n\n---\n\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `🏨 Total Hotels: ${hotels.length}\n\n${hotelList}`,
            },
          ],
        };
      }

      case 'create_room': {
        const roomData = RoomSchema.parse(args);
        
        // Check if hotel exists
        const hotel = hotels.find(h => h.id === roomData.hotelId);
        if (!hotel) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Hotel not found with ID: ${roomData.hotelId}`,
              },
            ],
          };
        }
        
        // Check if room number already exists in this hotel
        const existingRoom = rooms.find(r => r.hotelId === roomData.hotelId && r.roomNumber === roomData.roomNumber);
        if (existingRoom) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Room ${roomData.roomNumber} already exists in hotel ${hotel.name}`,
              },
            ],
          };
        }
        
        const room: Room = {
          id: generateId(),
          ...roomData,
          isAvailable: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        rooms.push(room);
        
        return {
          content: [
            {
              type: 'text',
              text: `✅ Room created successfully!\n\n${formatRoom(room)}`,
            },
          ],
        };
      }

      case 'get_room': {
        const { id } = args as any;
        const room = rooms.find(r => r.id === id);
        
        if (!room) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Room not found with ID: ${id}`,
              },
            ],
          };
        }
        
        return {
          content: [
            {
              type: 'text',
              text: formatRoom(room),
            },
          ],
        };
      }

      case 'list_rooms': {
        const { hotelId } = args as any;
        const hotelRooms = rooms.filter(r => r.hotelId === hotelId);
        
        if (hotelRooms.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `📭 No rooms found for hotel ID: ${hotelId}`,
              },
            ],
          };
        }
        
        const roomList = hotelRooms.map(formatRoom).join('\n\n---\n\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `🚪 Total Rooms: ${hotelRooms.length}\n\n${roomList}`,
            },
          ],
        };
      }

      case 'create_booking': {
        const bookingData = BookingSchema.parse(args);
        
        // Validate hotel exists
        const hotel = hotels.find(h => h.id === bookingData.hotelId);
        if (!hotel) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Hotel not found with ID: ${bookingData.hotelId}`,
              },
            ],
          };
        }
        
        // Validate room exists
        const room = rooms.find(r => r.id === bookingData.roomId);
        if (!room) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Room not found with ID: ${bookingData.roomId}`,
              },
            ],
          };
        }
        
        // Calculate total amount (simplified)
        const checkIn = new Date(bookingData.checkIn);
        const checkOut = new Date(bookingData.checkOut);
        const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
        const totalAmount = nights * room.price;
        
        const booking: Booking = {
          id: generateId(),
          ...bookingData,
          checkIn,
          checkOut,
          status: 'pending',
          totalAmount,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        bookings.push(booking);
        
        return {
          content: [
            {
              type: 'text',
              text: `✅ Booking created successfully!\n\n${formatBooking(booking)}`,
            },
          ],
        };
      }

      case 'list_bookings': {
        const { hotelId } = args as any;
        const hotelBookings = bookings.filter(b => b.hotelId === hotelId);
        
        if (hotelBookings.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `📭 No bookings found for hotel ID: ${hotelId}`,
              },
            ],
          };
        }
        
        const bookingList = hotelBookings.map(formatBooking).join('\n\n---\n\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `📋 Total Bookings: ${hotelBookings.length}\n\n${bookingList}`,
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
  console.error('ChatHotel Hotel Management MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});