#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { PrismaClient } from '@prisma/client';

// Initialize Prisma client
const prisma = new PrismaClient();

function generateBookingReference(hotelSlug) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substr(2, 3).toUpperCase();
  return `${hotelSlug.toUpperCase()}-${today}-${random}`;
}

function formatHotel(hotel) {
  return `🏨 ${hotel.name}\n` +
         `📍 ${hotel.address || 'No address'}\n` +
         `📞 ${hotel.phone}\n` +
         `📧 ${hotel.email}\n` +
         `🆔 ${hotel.id}\n` +
         `🏷️ Total Rooms: ${hotel.totalRooms}\n` +
         `⭐ Rating: ${hotel.starRating || 'Not rated'} stars\n` +
         `🔗 Slug: ${hotel.slug}\n` +
         `📅 Created: ${hotel.createdAt.toISOString()}`;
}

function formatRoom(room) {
  return `🚪 Room ${room.roomNumber}\n` +
         `🏨 Hotel: ${room.hotel?.name || 'Unknown'}\n` +
         `🛏️ Type: ${room.roomType?.name || 'Unknown'}\n` +
         `💰 Price: ₹${room.roomType?.basePrice || 0}/night\n` +
         `👥 Capacity: ${room.roomType?.capacity || 0} guests\n` +
         `✅ Status: ${room.status}\n` +
         `🆔 ${room.id}\n` +
         `🏷️ Amenities: ${room.roomType?.amenities ? JSON.parse(room.roomType.amenities).join(', ') : 'None'}\n` +
         `📝 ${room.roomType?.description || 'No description'}`;
}

function formatBooking(booking) {
  return `📋 Booking ${booking.bookingReference}\n` +
         `👤 Guest: ${booking.guest?.firstName} ${booking.guest?.lastName}\n` +
         `📧 Email: ${booking.guest?.email || 'Not provided'}\n` +
         `📞 Phone: ${booking.guest?.phone}\n` +
         `🏨 Hotel: ${booking.hotel?.name}\n` +
         `🚪 Room Type: ${booking.roomType?.name}\n` +
         `📅 Check-in: ${booking.checkInDate.toISOString().split('T')[0]}\n` +
         `📅 Check-out: ${booking.checkOutDate.toISOString().split('T')[0]}\n` +
         `🌙 Nights: ${booking.nights}\n` +
         `👥 Guests: ${booking.adults} adults${booking.children > 0 ? `, ${booking.children} children` : ''}\n` +
         `💰 Total: ₹${booking.totalAmount}\n` +
         `💳 Paid: ₹${booking.paidAmount}\n` +
         `📊 Status: ${booking.status}\n` +
         `📝 Special requests: ${booking.specialRequests || 'None'}`;
}

function formatGuest(guest) {
  return `👤 ${guest.firstName} ${guest.lastName}\n` +
         `📞 ${guest.phone}\n` +
         `📧 ${guest.email || 'Not provided'}\n` +
         `🆔 ${guest.id}\n` +
         `⭐ VIP: ${guest.vipStatus ? 'Yes' : 'No'}\n` +
         `📅 Registered: ${guest.createdAt.toISOString().split('T')[0]}`;
}

const server = new Server(
  {
    name: 'chathotel-hotel-management',
    version: '2.0.0',
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
        name: 'get_hotel',
        description: 'Get hotel by ID or slug',
        inputSchema: {
          type: 'object',
          properties: {
            identifier: { type: 'string', description: 'Hotel ID or slug' },
          },
          required: ['identifier'],
        },
      },
      {
        name: 'list_hotels',
        description: 'List all hotels',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', default: 10, description: 'Number of hotels to return' },
          },
        },
      },
      {
        name: 'create_room_type',
        description: 'Create a new room type for a hotel',
        inputSchema: {
          type: 'object',
          properties: {
            hotelId: { type: 'string', description: 'Hotel ID' },
            name: { type: 'string', description: 'Room type name (e.g., Standard, Deluxe, Suite)' },
            description: { type: 'string', description: 'Room type description' },
            basePrice: { type: 'number', description: 'Base price per night' },
            capacity: { type: 'number', description: 'Maximum occupancy' },
            amenities: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Room amenities array'
            },
            sizeSqft: { type: 'number', description: 'Room size in square feet' },
            bedType: { type: 'string', description: 'Bed type (king, queen, twin, etc.)' },
            bedCount: { type: 'number', description: 'Number of beds' },
          },
          required: ['hotelId', 'name', 'basePrice', 'capacity'],
        },
      },
      {
        name: 'create_room',
        description: 'Create a new room',
        inputSchema: {
          type: 'object',
          properties: {
            hotelId: { type: 'string', description: 'Hotel ID' },
            roomTypeId: { type: 'string', description: 'Room type ID' },
            roomNumber: { type: 'string', description: 'Room number' },
            floor: { type: 'number', description: 'Floor number' },
          },
          required: ['hotelId', 'roomTypeId', 'roomNumber'],
        },
      },
      {
        name: 'list_rooms',
        description: 'List rooms for a hotel',
        inputSchema: {
          type: 'object',
          properties: {
            hotelId: { type: 'string', description: 'Hotel ID to list rooms for' },
            status: { 
              type: 'string', 
              enum: ['AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'CLEANING', 'OUT_OF_ORDER'],
              description: 'Filter by room status' 
            },
          },
          required: ['hotelId'],
        },
      },
      {
        name: 'check_availability',
        description: 'Check room availability for given dates',
        inputSchema: {
          type: 'object',
          properties: {
            hotelId: { type: 'string', description: 'Hotel ID' },
            checkInDate: { type: 'string', description: 'Check-in date (YYYY-MM-DD)' },
            checkOutDate: { type: 'string', description: 'Check-out date (YYYY-MM-DD)' },
            roomTypeId: { type: 'string', description: 'Specific room type ID (optional)' },
          },
          required: ['hotelId', 'checkInDate', 'checkOutDate'],
        },
      },
      {
        name: 'create_booking',
        description: 'Create a new booking',
        inputSchema: {
          type: 'object',
          properties: {
            hotelId: { type: 'string', description: 'Hotel ID' },
            roomTypeId: { type: 'string', description: 'Room type ID' },
            guestName: { type: 'string', description: 'Guest full name' },
            guestEmail: { type: 'string', description: 'Guest email' },
            guestPhone: { type: 'string', description: 'Guest phone number' },
            checkInDate: { type: 'string', description: 'Check-in date (YYYY-MM-DD)' },
            checkOutDate: { type: 'string', description: 'Check-out date (YYYY-MM-DD)' },
            adults: { type: 'number', description: 'Number of adults' },
            children: { type: 'number', description: 'Number of children', default: 0 },
            specialRequests: { type: 'string', description: 'Special requests' },
          },
          required: ['hotelId', 'roomTypeId', 'guestName', 'guestPhone', 'checkInDate', 'checkOutDate', 'adults'],
        },
      },
      {
        name: 'list_bookings',
        description: 'List bookings for a hotel',
        inputSchema: {
          type: 'object',
          properties: {
            hotelId: { type: 'string', description: 'Hotel ID' },
            status: { 
              type: 'string', 
              enum: ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'],
              description: 'Filter by booking status' 
            },
            guestPhone: { type: 'string', description: 'Filter by guest phone number' },
            limit: { type: 'number', default: 20, description: 'Number of bookings to return' },
          },
          required: ['hotelId'],
        },
      },
      {
        name: 'get_booking',
        description: 'Get booking by reference or ID',
        inputSchema: {
          type: 'object',
          properties: {
            identifier: { type: 'string', description: 'Booking reference or ID' },
          },
          required: ['identifier'],
        },
      },
      {
        name: 'update_booking_status',
        description: 'Update booking status',
        inputSchema: {
          type: 'object',
          properties: {
            bookingId: { type: 'string', description: 'Booking ID' },
            status: { 
              type: 'string', 
              enum: ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'],
              description: 'New booking status' 
            },
            notes: { type: 'string', description: 'Status change notes' },
          },
          required: ['bookingId', 'status'],
        },
      },
      {
        name: 'search_guests',
        description: 'Search guests by phone or name',
        inputSchema: {
          type: 'object',
          properties: {
            hotelId: { type: 'string', description: 'Hotel ID' },
            phone: { type: 'string', description: 'Guest phone number' },
            name: { type: 'string', description: 'Guest name (partial match)' },
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
      case 'get_hotel': {
        const hotel = await prisma.hotel.findFirst({
          where: {
            OR: [
              { id: args.identifier },
              { slug: args.identifier },
            ],
          },
          include: {
            roomTypes: true,
            _count: {
              select: {
                rooms: true,
                bookings: true,
                guests: true,
              },
            },
          },
        });
        
        if (!hotel) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Hotel not found with identifier: ${args.identifier}`,
              },
            ],
          };
        }
        
        return {
          content: [
            {
              type: 'text',
              text: formatHotel(hotel) + `\n📊 Stats: ${hotel._count.rooms} rooms, ${hotel._count.bookings} bookings, ${hotel._count.guests} guests`,
            },
          ],
        };
      }

      case 'list_hotels': {
        const hotels = await prisma.hotel.findMany({
          where: { isActive: true },
          include: {
            _count: {
              select: {
                rooms: true,
                bookings: true,
              },
            },
          },
          take: args.limit || 10,
          orderBy: { createdAt: 'desc' },
        });
        
        if (hotels.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: '📭 No hotels found.',
              },
            ],
          };
        }
        
        const hotelList = hotels.map(hotel => 
          formatHotel(hotel) + `\n📊 ${hotel._count.rooms} rooms, ${hotel._count.bookings} bookings`
        ).join('\n\n---\n\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `🏨 Total Hotels: ${hotels.length}\n\n${hotelList}`,
            },
          ],
        };
      }

      case 'create_room_type': {
        const hotel = await prisma.hotel.findUnique({
          where: { id: args.hotelId },
        });
        
        if (!hotel) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Hotel not found with ID: ${args.hotelId}`,
              },
            ],
          };
        }
        
        const roomType = await prisma.roomType.create({
          data: {
            hotelId: args.hotelId,
            name: args.name,
            description: args.description,
            basePrice: args.basePrice,
            capacity: args.capacity,
            amenities: args.amenities || [],
            sizeSqft: args.sizeSqft,
            bedType: args.bedType,
            bedCount: args.bedCount || 1,
          },
        });
        
        return {
          content: [
            {
              type: 'text',
              text: `✅ Room type created successfully!\n\n` +
                    `🏷️ ${roomType.name}\n` +
                    `💰 ₹${roomType.basePrice}/night\n` +
                    `👥 Capacity: ${roomType.capacity}\n` +
                    `🆔 ${roomType.id}`,
            },
          ],
        };
      }

      case 'create_room': {
        const existingRoom = await prisma.room.findFirst({
          where: {
            hotelId: args.hotelId,
            roomNumber: args.roomNumber,
          },
        });
        
        if (existingRoom) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Room ${args.roomNumber} already exists in this hotel`,
              },
            ],
          };
        }
        
        const room = await prisma.room.create({
          data: {
            hotelId: args.hotelId,
            roomTypeId: args.roomTypeId,
            roomNumber: args.roomNumber,
            floor: args.floor,
          },
          include: {
            hotel: true,
            roomType: true,
          },
        });
        
        return {
          content: [
            {
              type: 'text',
              text: `✅ Room created successfully!\n\n${formatRoom(room)}`,
            },
          ],
        };
      }

      case 'list_rooms': {
        const whereClause = {
          hotelId: args.hotelId,
          isActive: true,
        };
        
        if (args.status) {
          whereClause.status = args.status;
        }
        
        const rooms = await prisma.room.findMany({
          where: whereClause,
          include: {
            hotel: { select: { name: true } },
            roomType: true,
          },
          orderBy: { roomNumber: 'asc' },
        });
        
        if (rooms.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `📭 No rooms found for hotel ID: ${args.hotelId}${args.status ? ` with status: ${args.status}` : ''}`,
              },
            ],
          };
        }
        
        const roomList = rooms.map(formatRoom).join('\n\n---\n\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `🚪 Total Rooms: ${rooms.length}\n\n${roomList}`,
            },
          ],
        };
      }

      case 'check_availability': {
        const checkIn = new Date(args.checkInDate);
        const checkOut = new Date(args.checkOutDate);
        
        const whereClause = {
          hotelId: args.hotelId,
          isActive: true,
        };
        
        if (args.roomTypeId) {
          whereClause.id = args.roomTypeId;
        }
        
        const roomTypes = await prisma.roomType.findMany({
          where: whereClause,
          include: {
            rooms: {
              where: {
                isActive: true,
                status: 'AVAILABLE',
              },
            },
            bookings: {
              where: {
                status: {
                  in: ['CONFIRMED', 'CHECKED_IN'],
                },
                OR: [
                  {
                    checkInDate: {
                      lte: checkIn,
                    },
                    checkOutDate: {
                      gt: checkIn,
                    },
                  },
                  {
                    checkInDate: {
                      lt: checkOut,
                    },
                    checkOutDate: {
                      gte: checkOut,
                    },
                  },
                  {
                    checkInDate: {
                      gte: checkIn,
                    },
                    checkOutDate: {
                      lte: checkOut,
                    },
                  },
                ],
              },
            },
          },
        });
        
        const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
        
        const availability = roomTypes.map(roomType => {
          const totalRooms = roomType.rooms.length;
          const bookedRooms = roomType.bookings.length;
          const availableRooms = Math.max(0, totalRooms - bookedRooms);
          const totalCost = roomType.basePrice * nights;
          
          return `🛏️ ${roomType.name}\n` +
                 `💰 ₹${roomType.basePrice}/night (₹${totalCost} total)\n` +
                 `👥 Capacity: ${roomType.capacity}\n` +
                 `✅ Available: ${availableRooms}/${totalRooms} rooms\n` +
                 `🆔 ${roomType.id}`;
        }).join('\n\n---\n\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `🗓️ Availability for ${args.checkInDate} to ${args.checkOutDate} (${nights} nights)\n\n${availability}`,
            },
          ],
        };
      }

      case 'create_booking': {
        // Parse guest name
        const nameParts = args.guestName.trim().split(' ');
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(' ') || '';
        
        // Check if guest exists, create if not
        let guest = await prisma.guest.findFirst({
          where: {
            hotelId: args.hotelId,
            phone: args.guestPhone,
          },
        });
        
        if (!guest) {
          guest = await prisma.guest.create({
            data: {
              hotelId: args.hotelId,
              firstName,
              lastName,
              phone: args.guestPhone,
              email: args.guestEmail,
              whatsappNumber: args.guestPhone,
            },
          });
        }
        
        // Get room type and hotel for pricing
        const roomType = await prisma.roomType.findUnique({
          where: { id: args.roomTypeId },
          include: { hotel: true },
        });
        
        if (!roomType) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Room type not found with ID: ${args.roomTypeId}`,
              },
            ],
          };
        }
        
        const checkIn = new Date(args.checkInDate);
        const checkOut = new Date(args.checkOutDate);
        const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
        const totalAmount = roomType.basePrice * nights;
        
        // Generate booking reference
        const bookingReference = generateBookingReference(roomType.hotel.slug);
        
        const booking = await prisma.booking.create({
          data: {
            hotelId: args.hotelId,
            guestId: guest.id,
            roomTypeId: args.roomTypeId,
            bookingReference,
            checkInDate: checkIn,
            checkOutDate: checkOut,
            nights,
            adults: args.adults,
            children: args.children || 0,
            roomRate: roomType.basePrice,
            totalAmount,
            specialRequests: args.specialRequests,
            status: 'PENDING',
          },
          include: {
            hotel: true,
            guest: true,
            roomType: true,
          },
        });
        
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
        const whereClause = {
          hotelId: args.hotelId,
        };
        
        if (args.status) {
          whereClause.status = args.status;
        }
        
        if (args.guestPhone) {
          whereClause.guest = {
            phone: args.guestPhone,
          };
        }
        
        const bookings = await prisma.booking.findMany({
          where: whereClause,
          include: {
            hotel: { select: { name: true } },
            guest: true,
            roomType: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: args.limit || 20,
        });
        
        if (bookings.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `📭 No bookings found for the specified criteria`,
              },
            ],
          };
        }
        
        const bookingList = bookings.map(formatBooking).join('\n\n---\n\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `📋 Total Bookings: ${bookings.length}\n\n${bookingList}`,
            },
          ],
        };
      }

      case 'get_booking': {
        const booking = await prisma.booking.findFirst({
          where: {
            OR: [
              { id: args.identifier },
              { bookingReference: args.identifier },
            ],
          },
          include: {
            hotel: true,
            guest: true,
            roomType: true,
            room: true,
            payments: true,
          },
        });
        
        if (!booking) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Booking not found with identifier: ${args.identifier}`,
              },
            ],
          };
        }
        
        return {
          content: [
            {
              type: 'text',
              text: formatBooking(booking),
            },
          ],
        };
      }

      case 'update_booking_status': {
        const booking = await prisma.booking.findUnique({
          where: { id: args.bookingId },
          include: { hotel: true, guest: true },
        });
        
        if (!booking) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Booking not found with ID: ${args.bookingId}`,
              },
            ],
          };
        }
        
        const updatedBooking = await prisma.booking.update({
          where: { id: args.bookingId },
          data: { status: args.status },
          include: {
            hotel: true,
            guest: true,
            roomType: true,
          },
        });
        
        // Create status history record
        await prisma.bookingStatusHistory.create({
          data: {
            bookingId: args.bookingId,
            hotelId: booking.hotelId,
            oldStatus: booking.status,
            newStatus: args.status,
            notes: args.notes,
          },
        });
        
        return {
          content: [
            {
              type: 'text',
              text: `✅ Booking status updated!\n\n${formatBooking(updatedBooking)}`,
            },
          ],
        };
      }

      case 'search_guests': {
        const whereClause = {
          hotelId: args.hotelId,
        };
        
        const orConditions = [];
        
        if (args.phone) {
          orConditions.push({ phone: args.phone });
        }
        
        if (args.name) {
          orConditions.push(
            {
              firstName: {
                contains: args.name,
                mode: 'insensitive',
              },
            },
            {
              lastName: {
                contains: args.name,
                mode: 'insensitive',
              },
            }
          );
        }
        
        if (orConditions.length > 0) {
          whereClause.OR = orConditions;
        }
        
        const guests = await prisma.guest.findMany({
          where: whereClause,
          include: {
            _count: {
              select: { bookings: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        });
        
        if (guests.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `📭 No guests found matching the criteria`,
              },
            ],
          };
        }
        
        const guestList = guests.map(guest => 
          formatGuest(guest) + `\n📋 Bookings: ${guest._count.bookings}`
        ).join('\n\n---\n\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `👥 Found ${guests.length} guests:\n\n${guestList}`,
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
  console.error('ChatHotel Hotel Management MCP Server (Database) running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});