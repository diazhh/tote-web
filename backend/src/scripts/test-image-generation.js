import { generateResultImage, generatePyramidImage, generateRecommendationsImage } from '../lib/imageGenerator.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test script for image generation
 */
async function testImageGeneration() {
  console.log('🧪 Testing Image Generation\n');

  // Test 1: LOTOANIMALITO (gameId: 1) - Ruleta style
  console.log('Test 1: LOTOANIMALITO (Ruleta)');
  try {
    const result1 = await generateResultImage({
      result: '05',
      scheduledAt: new Date('2025-10-02T14:00:00'),
      gameId: 1
    });
    console.log('✅ LOTOANIMALITO image generated:', result1.filename);
  } catch (error) {
    console.error('❌ Error generating LOTOANIMALITO image:', error.message);
  }

  // Test 2: LOTTOPANTERA (gameId: 2)
  console.log('\nTest 2: LOTTOPANTERA');
  try {
    const result2 = await generateResultImage({
      result: '23',
      scheduledAt: new Date('2025-10-02T15:00:00'),
      gameId: 2
    });
    console.log('✅ LOTTOPANTERA image generated:', result2.filename);
  } catch (error) {
    console.error('❌ Error generating LOTTOPANTERA image:', error.message);
  }

  // Test 3: Triple Pantera - Normal number (gameId: 3)
  console.log('\nTest 3: TRIPLE PANTERA (Normal)');
  try {
    const result3 = await generateResultImage({
      result: '347',
      scheduledAt: new Date('2025-10-02T16:00:00'),
      gameId: 3
    });
    console.log('✅ TRIPLE PANTERA (Normal) image generated:', result3.filename);
  } catch (error) {
    console.error('❌ Error generating TRIPLE PANTERA image:', error.message);
  }

  // Test 4: Triple Pantera - Special X00 (gameId: 3)
  console.log('\nTest 4: TRIPLE PANTERA (Special X00)');
  try {
    const result4 = await generateResultImage({
      result: '300',
      scheduledAt: new Date('2025-10-02T17:00:00'),
      gameId: 3
    });
    console.log('✅ TRIPLE PANTERA (Special) image generated:', result4.filename);
  } catch (error) {
    console.error('❌ Error generating TRIPLE PANTERA special image:', error.message);
  }

  // Test 5: Pyramid (LOTOANIMALITO)
  console.log('\nTest 5: Pyramid (LOTOANIMALITO)');
  try {
    const result5 = await generatePyramidImage(new Date('2025-10-02'));
    console.log('✅ Pyramid image generated:', result5.filename);
  } catch (error) {
    console.error('❌ Error generating Pyramid image:', error.message);
  }

  // Test 6: Recommendations (TRIPLE PANTERA)
  console.log('\nTest 6: Recommendations (TRIPLE PANTERA)');
  try {
    const result6 = await generateRecommendationsImage(3, new Date('2025-10-02'));
    console.log('✅ Recommendations image generated:', result6.filename);
  } catch (error) {
    console.error('❌ Error generating Recommendations image:', error.message);
  }

  console.log('\n✨ Image generation tests completed!');
  console.log('📁 Check the images in: backend/storage/results/');
}

// Run tests
testImageGeneration()
  .then(() => {
    console.log('\n✅ All tests completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
