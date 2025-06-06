import { PrismaClient, Prisma } from '@prisma/client';
const prisma = new PrismaClient();

function generateEmail(name: string, hotelSlug: string) {
  return name.toLowerCase().replace(/[^a-z]/g, "") + "@" + hotelSlug.replace(/-/g, "") + ".local";
}

async function main() {
  // Create Hotel - Darbar
  const darbar = await prisma.hotel.upsert({
    where: { slug: 'darbar-heritage-farmstay' },
    update: {},
    create: {
      name: "Darbar – A Heritage Farmstay",
      slug: "darbar-heritage-farmstay",
      email: "darbarorganichotel@gmail.com",
      phone: "+919910364826",
      whatsappNumber: "+919910364826",
      address: "Ranichauri, Chamba Road, Near New Tehri",
      city: "Tehri Garhwal",
      state: "Uttarakhand",
      country: "India",
      postalCode: "249145",
      timezone: "Asia/Kolkata",
      totalRooms: 13,
      hotelType: "heritage",
      starRating: 4,
      subscriptionPlan: "premium",
      subscriptionStatus: "active",
      subscriptionEndsAt: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
      isActive: true,
      googleMapsLink: "https://maps.app.goo.gl/JCAetmW1ZCGF3Fyy8"
    }
  });

  // Create Hotel - The Deck
  const deck = await prisma.hotel.upsert({
    where: { slug: 'the-deck' },
    update: {},
    create: {
      name: "The Deck – Indian Fusion & Bar",
      slug: "the-deck",
      email: "thedeckbataghaat@gmail.com",
      phone: "+919286041236",
      whatsappNumber: "+919286041236",
      address: "Bataghaat, Near Landour, Mussoorie",
      city: "Mussoorie",
      state: "Uttarakhand",
      country: "India",
      postalCode: "248179",
      timezone: "Asia/Kolkata",
      totalRooms: 0,
      hotelType: "restaurant",
      starRating: 4,
      subscriptionPlan: "free",
      subscriptionStatus: "trial",
      subscriptionEndsAt: new Date(new Date().setMonth(new Date().getMonth() + 1)),
      isActive: true,
      googleMapsLink: "https://maps.app.goo.gl/Qjvc4NnYZQQKDcWn8"
    }
  });

  // Room Types for Darbar
  const [familySuite, heritageRoom, greenChalet] = await Promise.all([
    prisma.roomType.create({
      data: {
        hotelId: darbar.id,
        name: "Family Suite – HR01",
        description: "Spacious suite with 2 kid-size beds and heritage interiors.",
        capacity: 4,
        basePrice: new Prisma.Decimal(6500),
        weekendPrice: new Prisma.Decimal(7000),
        seasonalMultiplier: new Prisma.Decimal(1.25),
        amenities: ["WiFi", "Heater", "Hot Water", "2 Kids Beds"],
        sizeSqft: 350,
        bedType: "Queen + 2 Kid Beds",
        bedCount: 3
      }
    }),
    prisma.roomType.create({
      data: {
        hotelId: darbar.id,
        name: "Heritage Room",
        description: "Charming rooms with Garhwali-style decor and modern comfort.",
        capacity: 2,
        basePrice: new Prisma.Decimal(5500),
        weekendPrice: new Prisma.Decimal(6000),
        seasonalMultiplier: new Prisma.Decimal(1.15),
        amenities: ["WiFi", "Heater", "Hot Water"],
        sizeSqft: 300,
        bedType: "Queen",
        bedCount: 1
      }
    }),
    prisma.roomType.create({
      data: {
        hotelId: darbar.id,
        name: "Green Chalet",
        description: "Luxury tented chalets with private sit-outs and forest views.",
        capacity: 3,
        basePrice: new Prisma.Decimal(7500),
        weekendPrice: new Prisma.Decimal(8000),
        seasonalMultiplier: new Prisma.Decimal(1.3),
        amenities: ["WiFi", "Heater", "Balcony", "Forest View"],
        sizeSqft: 400,
        bedType: "King",
        bedCount: 1
      }
    })
  ]);

  // Rooms for Darbar
  await prisma.room.createMany({
    data: [
      { hotelId: darbar.id, roomTypeId: familySuite.id, roomNumber: "HR01", floor: 1 },
      { hotelId: darbar.id, roomTypeId: heritageRoom.id, roomNumber: "HR03", floor: 1 },
      { hotelId: darbar.id, roomTypeId: heritageRoom.id, roomNumber: "HR04", floor: 1 },
      { hotelId: darbar.id, roomTypeId: heritageRoom.id, roomNumber: "HR05", floor: 1 },
      { hotelId: darbar.id, roomTypeId: heritageRoom.id, roomNumber: "HR06", floor: 1 },
      { hotelId: darbar.id, roomTypeId: heritageRoom.id, roomNumber: "HR07", floor: 1 },
      { hotelId: darbar.id, roomTypeId: heritageRoom.id, roomNumber: "HR08", floor: 1 },
      { hotelId: darbar.id, roomTypeId: heritageRoom.id, roomNumber: "HR09", floor: 1 },
      { hotelId: darbar.id, roomTypeId: heritageRoom.id, roomNumber: "HR10", floor: 2 },
      { hotelId: darbar.id, roomTypeId: greenChalet.id, roomNumber: "Chalet01", floor: 0 },
      { hotelId: darbar.id, roomTypeId: greenChalet.id, roomNumber: "Chalet02", floor: 0 },
      { hotelId: darbar.id, roomTypeId: greenChalet.id, roomNumber: "Chalet03", floor: 0 },
      { hotelId: darbar.id, roomTypeId: greenChalet.id, roomNumber: "Chalet04", floor: 0 }
    ]
  });

  const darbarEmployees = [
    "SAURAV SINGH", "Suraj UT", "Jai Kaintura", "Gaurav", "Kamal NEGI", "Harish", "MAMTA",
    "Mohan Lal", "Parmila", "Sunil", "Baadal", "Karan", "Suraj", "Vipul Rawat", "Manvir Sajwan",
    "Manu Dhiman", "ASHOK MALIK", "SARTHAK KUMARIA"
  ];

  await prisma.hotelUser.createMany({
    data: darbarEmployees.map(name => ({
      hotelId: darbar.id,
      name,
      role: "Staff",
      phone: "",
      email: generateEmail(name, darbar.slug),
      passwordHash: "",
      permissions: {},
      isActive: true
    }))
  });

  const deckEmployees = [
    "Kuldeep Rana", "Deepak", "Varun", "Ankit Rana", "Arjun Singh", "Bhupendra", "Sandeep Rana", "Praveen"
  ];

  await prisma.hotelUser.createMany({
    data: deckEmployees.map(name => ({
      hotelId: deck.id,
      name,
      role: "Staff",
      phone: "",
      email: generateEmail(name, deck.slug),
      passwordHash: "",
      permissions: {},
      isActive: true
    }))
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
