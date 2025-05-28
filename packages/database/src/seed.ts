// packages/database/src/seed.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding ChatHotel database with Darbar – A Heritage Farmstay data...');

  // Create Darbar Hotel
  const darbarHotel = await prisma.hotel.create({
    data: {
      name: 'Darbar – A Heritage Farmstay',
      slug: 'darbar-farmstay',
      email: 'darbarorganichotel@gmail.com',
      phone: '+91-9910364826',
      whatsappNumber: '+91-9910364826',
      address: 'Ranichauri, Near Chamba',
      city: 'New Tehri',
      state: 'Uttarakhand',
      country: 'India',
      totalRooms: 13,
      hotelType: 'heritage',
      starRating: 4,
      subscriptionPlan: 'pro',
      subscriptionStatus: 'active',
    },
  });

  console.log(`✅ Created hotel: ${darbarHotel.name}`);

  // Create staff
  const owner = await prisma.hotelUser.create({
    data: {
      hotelId: darbarHotel.id,
      name: 'Sarthak Kumaria',
      email: 'sarthak@darbarfarmstay.com',
      passwordHash: '$2a$10$dummy.hash.for.testing',
      phone: '+91-9910364826',
      role: 'owner',
    },
  });

  const manager = await prisma.hotelUser.create({
    data: {
      hotelId: darbarHotel.id,
      name: 'Meenal',
      email: 'meenal@darbarfarmstay.com',
      passwordHash: '$2a$10$dummy.hash.for.testing',
      phone: '+91-9702456293',
      role: 'manager',
    },
  });

  console.log(`✅ Created staff: ${owner.name}, ${manager.name}`);

  // Create room types
  const heritageRoom = await prisma.roomType.create({
    data: {
      hotelId: darbarHotel.id,
      name: 'Heritage Room',
      description: 'Vintage-styled room with royal interiors',
      capacity: 2,
      basePrice: 5000.0,
      amenities: ['wifi', 'heater', 'attached_bathroom'],
      sizeSqft: 250,
      bedType: 'queen',
      bedCount: 1,
    },
  });

  const chalet = await prisma.roomType.create({
    data: {
      hotelId: darbarHotel.id,
      name: 'Luxury Chalet',
      description: 'Spacious luxury tent cottage with scenic views',
      capacity: 3,
      basePrice: 7000.0,
      weekendPrice: 8000.0,
      amenities: ['wifi', 'private_deck', 'heater', 'attached_bathroom'],
      sizeSqft: 400,
      bedType: 'king',
      bedCount: 1,
    },
  });

  console.log(`✅ Created room types: ${heritageRoom.name}, ${chalet.name}`);

  // Create rooms
  const rooms = [];
  for (let i = 1; i <= 9; i++) {
    rooms.push({
      hotelId: darbarHotel.id,
      roomTypeId: heritageRoom.id,
      roomNumber: `H${i}`,
      floor: 1,
      status: 'AVAILABLE',
    });
  }
  for (let i = 1; i <= 4; i++) {
    rooms.push({
      hotelId: darbarHotel.id,
      roomTypeId: chalet.id,
      roomNumber: `C${i}`,
      floor: 1,
      status: 'AVAILABLE',
    });
  }
  await prisma.room.createMany({ data: rooms });

  console.log(`✅ Created ${rooms.length} rooms`);

  console.log('\n🎉 Darbar Farmstay seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
