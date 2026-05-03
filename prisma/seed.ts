import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Create admin user (you)
  const adminPassword = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.upsert({
    where: { email: "ashish@leen-a-po.com" },
    update: {},
    create: {
      email: "ashish@leen-a-po.com",
      password: adminPassword,
      name: "Ashish",
      role: "admin",
    },
  });

  // Create GF user
  const gfPassword = await bcrypt.hash("leena123", 10);
  const gf = await prisma.user.upsert({
    where: { email: "leena@leen-a-po.com" },
    update: {},
    create: {
      email: "leena@leen-a-po.com",
      password: gfPassword,
      name: "Leena",
      role: "user",
    },
  });

  // Add a couple of bucket list items
  const existingItems = await prisma.bucketItem.count();
  if (existingItems === 0) {
    await prisma.bucketItem.createMany({
      data: [
        { title: "Watch a meteor shower together 🌠", addedById: admin.id },
        { title: "Cook a new recipe together 🍳", addedById: admin.id },
        { title: "Take a spontaneous road trip 🚗", addedById: gf.id },
      ],
    });
  }

  console.log("✅ Seed complete!");
  console.log("Admin:", admin.email, "/ password: admin123");
  console.log("GF:", gf.email, "/ password: leena123");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
