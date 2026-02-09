/**
 * 🧪 Test Script: Send Messages (Text, Image, Video, File)
 *
 * Usage: npm run test:send
 *
 * This script tests all message types:
 * - Text message
 * - Image (PNG generated on the fly)
 * - Video (MP4 generated on the fly)
 * - Document (PDF generated on the fly)
 */

import { WhatsAppDirectService } from '../dist/services/whatsapp-direct.service.js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createCanvas } from '@napi-rs/canvas';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SENDER = '51902049935';
const RECIPIENT = '120363376500470254@g.us'; // Group
const TEMP_DIR = path.join(__dirname, '../temp');

// Ensure temp directory exists
import { mkdirSync, existsSync } from 'fs';
if (!existsSync(TEMP_DIR)) {
  mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Generate a simple PNG image (200x200 blue square with text)
 */
async function generateTestImage() {
  const canvas = createCanvas(200, 200);
  const ctx = canvas.getContext('2d');

  // Blue background
  ctx.fillStyle = '#0066cc';
  ctx.fillRect(0, 0, 200, 200);

  // White text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Test Image', 100, 100);
  ctx.font = '16px Arial';
  ctx.fillText(new Date().toLocaleTimeString(), 100, 130);

  return canvas.toBuffer('image/png');
}

/**
 * Generate a simple MP4 video (1 second, 200x200, red square)
 * NOTE: For simplicity, we'll generate a PNG instead and send it as image
 * Real MP4 generation requires ffmpeg
 */
async function generateTestVideo() {
  // For this test, we'll just generate another image
  // In production, you'd use ffmpeg to generate real video
  const canvas = createCanvas(200, 200);
  const ctx = canvas.getContext('2d');

  // Red background
  ctx.fillStyle = '#cc0000';
  ctx.fillRect(0, 0, 200, 200);

  // White text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Video Frame', 100, 100);
  ctx.font = '16px Arial';
  ctx.fillText(new Date().toLocaleTimeString(), 100, 130);

  return canvas.toBuffer('image/jpeg');
}

/**
 * Generate a simple PDF document
 */
async function generateTestPDF() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([400, 600]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Title
  page.drawText('Test Document', {
    x: 50,
    y: 550,
    size: 24,
    font: boldFont,
    color: rgb(0, 0, 0.5),
  });

  // Content
  page.drawText('This is a test PDF document generated on the fly.', {
    x: 50,
    y: 500,
    size: 12,
    font,
    color: rgb(0, 0, 0),
  });

  page.drawText(`Generated at: ${new Date().toLocaleString()}`, {
    x: 50,
    y: 480,
    size: 10,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });

  page.drawText('This PDF demonstrates the document sending functionality.', {
    x: 50,
    y: 450,
    size: 12,
    font,
    color: rgb(0, 0, 0),
  });

  return await pdfDoc.save();
}

/**
 * Main test function
 */
async function testSendMessages() {
  console.log('🧪 Starting message send test...\n');
  console.log(`📱 Sender: ${SENDER}`);
  console.log(`👥 Recipient: ${RECIPIENT}\n`);

  // Check if session is ready
  if (!WhatsAppDirectService.isSessionReady(SENDER)) {
    console.error('❌ Session is not ready. Please connect first.');
    console.log('\nStart the server and scan QR code:');
    console.log('  npm run dev');
    console.log('  Then visit: http://localhost:3000/api/sessions');
    process.exit(1);
  }

  console.log('✅ Session is ready\n');

  try {
    // 1. Send text message
    console.log('📤 1/4 Sending text message...');
    await WhatsAppDirectService.sendMessage(SENDER, RECIPIENT, '🧪 Test Message: This is a test text message from the automated test script.');
    console.log('✅ Text message sent\n');

    // Small delay between messages
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 2. Send image
    console.log('📤 2/4 Sending image...');
    const imageBuffer = await generateTestImage();
    await WhatsAppDirectService.sendImageFile(SENDER, RECIPIENT, {
      buffer: imageBuffer,
      fileName: 'test-image.png',
      caption: '🖼️ Test Image: Generated on the fly',
    });
    console.log('✅ Image sent\n');

    await new Promise(resolve => setTimeout(resolve, 2000));

    // 3. Send "video" (using image for now)
    console.log('📤 3/4 Sending video (mock with image)...');
    const videoBuffer = await generateTestVideo();
    await WhatsAppDirectService.sendImageFile(SENDER, RECIPIENT, {
      buffer: videoBuffer,
      fileName: 'test-video-frame.jpg',
      caption: '🎥 Test Video: Simulated video frame (use ffmpeg for real video)',
    });
    console.log('✅ Video/image sent\n');
    console.log('ℹ️  Note: Real MP4 video generation requires ffmpeg. This sent an image instead.\n');

    await new Promise(resolve => setTimeout(resolve, 2000));

    // 4. Send PDF document
    console.log('📤 4/4 Sending PDF document...');
    const pdfBuffer = Buffer.from(await generateTestPDF());
    await WhatsAppDirectService.sendDocument(SENDER, RECIPIENT, {
      buffer: pdfBuffer,
      fileName: 'test-document.pdf',
      caption: '📄 Test Document: Generated PDF',
    });
    console.log('✅ PDF document sent\n');

    console.log('🎉 All messages sent successfully!\n');
    console.log('Check your WhatsApp group to see the messages.');

  } catch (error) {
    console.error('\n❌ Error sending messages:', error);
    process.exit(1);
  }
}

// Run the test
testSendMessages()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
