import asyncio
from playwright import async_api
from playwright.async_api import expect

async def run_test():
    pw = None
    browser = None
    context = None
    
    try:
        # Start a Playwright session in asynchronous mode
        pw = await async_api.async_playwright().start()
        
        # Launch a Chromium browser in headless mode with custom arguments
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",         # Set the browser window size
                "--disable-dev-shm-usage",        # Avoid using /dev/shm which can cause issues in containers
                "--ipc=host",                     # Use host-level IPC for better stability
                "--single-process"                # Run the browser in a single process mode
            ],
        )
        
        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        context.set_default_timeout(5000)
        
        # Open a new page in the browser context
        page = await context.new_page()
        
        # Navigate to your target URL and wait until the network request is committed
        await page.goto("http://localhost:3000/login", wait_until="commit", timeout=10000)
        
        # Wait for the main page to reach DOMContentLoaded state (optional for stability)
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=3000)
        except async_api.Error:
            pass
        
        # Iterate through all iframes and wait for them to load as well
        for frame in page.frames:
            try:
                await frame.wait_for_load_state("domcontentloaded", timeout=3000)
            except async_api.Error:
                pass
        
        # Interact with the page elements to simulate user flow
        # -> Input username and password and click login button to authenticate as admin
        frame = context.pages[-1]
        # Input username 'admin'
        elem = frame.locator('xpath=html/body/div/div/div/div[3]/form/div/div/input').nth(0)
        await page.wait_for_timeout(3000); await elem.fill('admin')
        

        frame = context.pages[-1]
        # Input password 'admin123'
        elem = frame.locator('xpath=html/body/div/div/div/div[3]/form/div[2]/div/input').nth(0)
        await page.wait_for_timeout(3000); await elem.fill('admin123')
        

        frame = context.pages[-1]
        # Click login button to submit credentials
        elem = frame.locator('xpath=html/body/div/div/div/div[3]/form/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Navigate to 'Sorteos' section to check active draw templates
        frame = context.pages[-1]
        # Click on 'Sorteos' menu to view draw templates
        elem = frame.locator('xpath=html/body/div/div/div/nav/a[2]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click the 'Generar Sorteos del Día' button to trigger the scheduled job for daily draw generation
        frame = context.pages[-1]
        # Click 'Generar Sorteos del Día' button to trigger daily draw generation job
        elem = frame.locator('xpath=html/body/div/div/div[2]/main/div/div/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Navigate to 'Pausas y Emergencia' section to verify pause and holiday settings
        frame = context.pages[-1]
        # Click on 'Pausas y Emergencia' menu to check pause and holiday settings
        elem = frame.locator('xpath=html/body/div/div/div/nav/a[11]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Return to 'Sorteos' section to confirm scheduled draws are generated correctly today respecting no pauses or holidays
        frame = context.pages[-1]
        # Click on 'Sorteos' menu to return and verify scheduled draws
        elem = frame.locator('xpath=html/body/div/div/div/nav/a[2]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # --> Assertions to verify final state
        frame = context.pages[-1]
        await expect(frame.locator('text=TRIPLE PANTERA TRIPLE').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=LOTTOPANTERA ROULETTE').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=LOTOANIMALITO ANIMALITOS').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=22/12/2025 19:00').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=22/12/2025 18:00').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=22/12/2025 17:00').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=22/12/2025 16:00').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=22/12/2025 15:00').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=22/12/2025 14:00').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=22/12/2025 13:00').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Programado').first).to_be_visible(timeout=30000)
        await asyncio.sleep(5)
    
    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()
            
asyncio.run(run_test())
    