// packages/database/src/seed.ts

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding ChatHotel database...')
  
  // Create test hotels
  const hotel1 = await prisma.hotel.create({
    data: {
      name: 'Boutique Paradise Hotel',
      slug: 'boutique-paradise',
      email: 'owner@boutiqueparadise.com',
      phone: '+91-9876543210',
      whatsappNumber: '+91-9876543210',
      address: '123 Beach Road, Tourist Area',
      city: 'Goa',
      state: 'Goa',
      country: 'India',
      totalRooms: 15,
      hotelType: 'boutique',
      starRating: 4,
      subscriptionPlan: 'growth',
      subscriptionStatus: 'active',
    }
  })
  
  const hotel2 = await prisma.hotel.create({
    data: {
      name: 'Mountain View Resort',
      slug: 'mountain-view',
      email: 'manager@mountainview.com',
      phone: '+91-8765432109',
      whatsappNumber: '+91-8765432109',
      address: '456 Hill Station Road',
      city: 'Shimla',
      state: 'Himachal Pradesh',
      country: 'India',
      totalRooms: 25,
      hotelType: 'resort',
      starRating: 5,
    }
  })
  
  console.log(`✅ Created hotels: ${hotel1.name}, ${hotel2.name}`)
  
  // Create staff for Hotel 1
  const owner = await prisma.hotelUser.create({
    data: {
      hotelId: hotel1.id,
      name: 'Raj Kumar',
      email: 'raj@boutiqueparadise.com',
      passwordHash: '$2a$10$dummy.hash.for.testing', // In real app, hash properly
      phone: '+91-9876543211',
      role: 'owner',
    }
  })
  
  const manager = await prisma.hotelUser.create({
    data: {
      hotelId: hotel1.id,
      name: 'Priya Sharma',
      email: 'priya@boutiqueparadise.com',
      passwordHash: '$2a$10$dummy.hash.for.testing',
      phone: '+91-9876543212',
      role: 'manager',
    }
  })
  
  const reception = await prisma.hotelUser.create({
    data: {
      hotelId: hotel1.id,
      name: 'Amit Singh',
      email: 'amit@boutiqueparadise.com',
      passwordHash: '$2a$10$dummy.hash.for.testing',
      phone: '+91-9876543213',
      role: 'reception',
    }
  })
  
  console.log(`✅ Created staff: ${owner.name}, ${manager.name}, ${reception.name}`)
  
  // Create room types for Hotel 1
  const standardRoom = await prisma.roomType.create({
    data: {
      hotelId: hotel1.id,
      name: 'Standard Room',
      description: 'Comfortable room with all basic amenities',
      capacity: 2,
      basePrice: 2500.00,
      amenities: ['wifi', 'ac', 'tv', 'minibar'],
      sizeSqft: 300,
      bedType: 'queen',
      bedCount: 1,
    }
  })
  
  const deluxeRoom = await prisma.roomType.create({
    data: {
      hotelId: hotel1.id,
      name: 'Deluxe Room',
      description: 'Spacious room with balcony and sea view',
      capacity: 3,
      basePrice: 4000.00,
      weekendPrice: 4500.00,
      amenities: ['wifi', 'ac', 'tv', 'minibar', 'balcony', 'sea_view'],
      sizeSqft: 450,
      bedType: 'king',
      bedCount: 1,
    }
  })
  
  const suiteRoom = await prisma.roomType.create({
    data: {
      hotelId: hotel1.id,
      name: 'Presidential Suite',
      description: 'Luxury suite with separate living area',
      capacity: 4,
      basePrice: 8000.00,
      weekendPrice: 10000.00,
      amenities: ['wifi', 'ac', 'tv', 'minibar', 'balcony', 'sea_view', 'jacuzzi', 'kitchenette'],
      sizeSqft: 800,
      bedType: 'king',
      bedCount: 2,
    }
  })
  
  console.log(`✅ Created room types: ${standardRoom.name}, ${deluxeRoom.name}, ${suiteRoom.name}`)
  
  // Create individual rooms for Hotel 1
  const rooms = []
  
  // Standard rooms (101-110)
  for (let i = 101; i <= 110; i++) {
    rooms.push({
      hotelId: hotel1.id,
      roomTypeId: standardRoom.id,
      roomNumber: i.toString(),
      floor: Math.floor(i / 100),
      status: 'AVAILABLE',
    })
  }
  
  // Deluxe rooms (201-205)
  for (let i = 201; i <= 205; i++) {
    rooms.push({
      hotelId: hotel1.id,
      roomTypeId: deluxeRoom.id,
      roomNumber: i.toString(),
      floor: Math.floor(i / 100),
      status: 'AVAILABLE',
    })
  }
  
  // Suite rooms (301-302)
  for (let i = 301; i <= 302; i++) {
    rooms.push({
      hotelId: hotel1.id,
      roomTypeId: suiteRoom.id,
      roomNumber: i.toString(),
      floor: Math.floor(i / 100),
      status: 'AVAILABLE',
    })
  }
  
  await prisma.room.createMany({ data: rooms })
  console.log(`✅ Created ${rooms.length} individual rooms`)
  
  // Create test guests
  const guest1 = await prisma.guest.create({
    data: {
      hotelId: hotel1.id,
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@email.com',
      phone: '+91-9988776655',
      whatsappNumber: '+91-9988776655',
      nationality: 'Indian',
      preferences: {
        dietary: 'vegetarian',
        roomPreference: 'high_floor',
        specialRequests: 'Extra pillows'
      },
    }
  })
  
  const guest2 = await prisma.guest.create({
    data: {
      hotelId: hotel1.id,
      firstName: 'Sarah',
      lastName: 'Smith',
      email: 'sarah.smith@email.com',
      phone: '+91-9988776656',
      whatsappNumber: '+91-9988776656',
      nationality: 'American',
      vipStatus: true,
      preferences: {
        roomPreference: 'sea_view',
        specialRequests: 'Late checkout'
      },
    }
  })
  
  console.log(`✅ Created guests: ${guest1.firstName} ${guest1.lastName}, ${guest2.firstName} ${guest2.lastName}`)
  
  // Create test bookings
  const booking1 = await prisma.booking.create({
    data: {
      hotelId: hotel1.id,
      guestId: guest1.id,
      roomTypeId: standardRoom.id,
      bookingReference: 'BOUTIQUE-PARADISE-20241201-001',
      checkInDate: new Date('2024-12-15'),
      checkOutDate: new Date('2024-12-18'),
      nights: 3,
      adults: 2,
      children: 0,
      roomRate: 2500.00,
      totalAmount: 7500.00,
      status: 'CONFIRMED',
      bookingSource: 'whatsapp',
      specialRequests: 'Early check-in requested',
    }
  })
  
  const booking2 = await prisma.booking.create({
    data: {
      hotelId: hotel1.id,
      guestId: guest2.id,
      roomTypeId: deluxeRoom.id,
      bookingReference: 'BOUTIQUE-PARADISE-20241201-002',
      checkInDate: new Date('2024-12-20'),
      checkOutDate: new Date('2024-12-25'),
      nights: 5,
      adults: 2,
      children: 1,
      roomRate: 4000.00,
      totalAmount: 20000.00,
      status: 'PENDING',
      bookingSource: 'whatsapp',
      earlyCheckin: true,
      lateCheckout: true,
    }
  })
  
  console.log(`✅ Created bookings: ${booking1.bookingReference}, ${booking2.bookingReference}`)
  
  // Create test payment for booking1
  const payment1 = await prisma.payment.create({
    data: {
      hotelId: hotel1.id,
      bookingId: booking1.id,
      paymentReference: 'PAY-' + booking1.bookingReference,
      amount: 7500.00,
      currency: 'INR',
      paymentMethod: 'razorpay',
      paymentGateway: 'razorpay',
      gatewayTransactionId: 'rzp_test_1234567890',
      status: 'COMPLETED',
      processedAt: new Date(),
    }
  })
  
  // Update booking1 paid amount
  await prisma.booking.update({
    where: { id: booking1.id },
    data: { paidAmount: 7500.00 }
  })
  
  console.log(`✅ Created payment: ${payment1.paymentReference}`)
  
  // Create some WhatsApp messages
  await prisma.whatsAppMessage.createMany({
    data: [
      {
        hotelId: hotel1.id,
        whatsappMessageId: 'wamid.test1234567890',
        guestPhone: guest1.phone,
        guestId: guest1.id,
        bookingId: booking1.id,
        content: 'Hi, I would like to book a room for 3 nights',
        messageType: 'text',
        direction: 'inbound',
        status: 'read',
      },
      {
        hotelId: hotel1.id,
        whatsappMessageId: 'wamid.test1234567891',
        guestPhone: guest1.phone,
        guestId: guest1.id,
        bookingId: booking1.id,
        content: 'Thank you for your inquiry! I can help you book a room. Let me check availability.',
        messageType: 'text',
        direction: 'outbound',
        status: 'delivered',
      },
      {
        hotelId: hotel1.id,
        whatsappMessageId: 'wamid.test1234567892',
        guestPhone: guest2.phone,
        guestId: guest2.id,
        bookingId: booking2.id,
        content: 'Can I get a sea view room for December 20-25?',
        messageType: 'text',
        direction: 'inbound',
        status: 'read',
      }
    ]
  })
  
  console.log(`✅ Created WhatsApp message history`)
  
  // Create booking status history
  await prisma.bookingStatusHistory.createMany({
    data: [
      {
        bookingId: booking1.id,
        hotelId: hotel1.id,
        oldStatus: null,
        newStatus: 'PENDING',
        changedBy: reception.id,
        notes: 'Initial booking created via WhatsApp',
      },
      {
        bookingId: booking1.id,
        hotelId: hotel1.id,
        oldStatus: 'PENDING',
        newStatus: 'CONFIRMED',
        changedBy: manager.id,
        notes: 'Payment received, booking confirmed',
      }
    ]
  })
  
  console.log(`✅ Created booking status history`)
  
  // Create a pricing rule
  await prisma.pricingRule.create({
    data: {
      hotelId: hotel1.id,
      roomTypeId: deluxeRoom.id,
      ruleName: 'Weekend Premium',
      ruleType: 'weekend',
      daysOfWeek: [6, 7], // Saturday, Sunday
      adjustmentType: 'percentage',
      adjustmentValue: 20.00, // 20% increase
      priority: 1,
    }
  })
  
  console.log(`✅ Created pricing rule`)
  
  console.log('\n🎉 Database seeding completed successfully!')
  console.log('\n📊 Summary:')
  console.log(`   🏨 Hotels: 2`)
  console.log(`   👥 Staff: 3`)
  console.log(`   🏠 Room Types: 3`)
  console.log(`   🚪 Individual Rooms: ${rooms.length}`)
  console.log(`   👤 Guests: 2`)
  console.log(`   📅 Bookings: 2`)
  console.log(`   💳 Payments: 1`)
  console.log(`   💬 WhatsApp Messages: 3`)
  
  console.log('\n🔗 Test Data:')
  console.log(`   Hotel 1: ${hotel1.name} (Slug: ${hotel1.slug})`)
  console.log(`   Hotel 1 ID: ${hotel1.id}`)
  console.log(`   Confirmed Booking: ${booking1.bookingReference}`)
  console.log(`   Pending Booking: ${booking2.bookingReference}`)
  console.log('\n🚀 Ready for MCP server integration!')
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })