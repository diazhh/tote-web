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
        # -> Input username and password, then click login button to authenticate as admin.
        frame = context.pages[-1]
        # Input username 'admin'
        elem = frame.locator('xpath=html/body/div/div/div/div[3]/form/div/div/input').nth(0)
        await page.wait_for_timeout(3000); await elem.fill('admin')
        

        frame = context.pages[-1]
        # Input password 'admin123'
        elem = frame.locator('xpath=html/body/div/div/div/div[3]/form/div[2]/div/input').nth(0)
        await page.wait_for_timeout(3000); await elem.fill('admin123')
        

        frame = context.pages[-1]
        # Click 'Iniciar Sesión' button to login
        elem = frame.locator('xpath=html/body/div/div/div/div[3]/form/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Navigate to 'Sorteos' section to set a new draw scheduled 10 minutes in the future.
        frame = context.pages[-1]
        # Click on 'Sorteos' to manage draws
        elem = frame.locator('xpath=html/body/div/div/div/nav/a[2]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click 'Generar Sorteos del Día' to create a new draw scheduled 10 minutes from now.
        frame = context.pages[-1]
        # Click 'Generar Sorteos del Día' button to generate today's draws
        elem = frame.locator('xpath=html/body/div/div/div[2]/main/div/div/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click 'Ver detalles' on a draw scheduled closest to 10 minutes in the future (e.g., the 19:00 draw) to check if its time can be edited to 10 minutes from now.
        frame = context.pages[-1]
        # Click 'Ver detalles' on the LOTTOPANTERA draw scheduled at 19:00
        elem = frame.locator('xpath=html/body/div/div/div[2]/main/div/div[3]/div/table/tbody/tr/td[5]/div/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Select a number from the dropdown and click 'Preseleccionar' to preselect a winner manually.
        frame = context.pages[-1]
        # Click 'Preseleccionar' button to preselect the winner
        elem = frame.locator('xpath=html/body/div/div/div[2]/main/div/div[4]/div/div[2]/div/div/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Try to close the draw manually or find an alternative way to trigger the draw closure and winner preselection, or check for WebSocket and Telegram notifications related to draw closure.
        frame = context.pages[-1]
        # Click 'Cerrar' button to close the draw details modal and return to the draws list
        elem = frame.locator('xpath=html/body/div/div/div[2]/main/div/div[4]/div/div[3]/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click 'Ver detalles' on the draw scheduled at 19:00 for TRIPLE PANTERA (index 28) to check if its time can be edited to 10 minutes from now.
        frame = context.pages[-1]
        # Click 'Ver detalles' on the TRIPLE PANTERA draw scheduled at 19:00
        elem = frame.locator('xpath=html/body/div/div/div[2]/main/div/div[2]/div/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # --> Assertions to verify final state
        frame = context.pages[-1]
        await expect(frame.locator('text=Cerrado').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=-').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=WebSocket notifications about the closed draw and preselection').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Telegram notifications are sent to the configured admin group/channel.').first).to_be_visible(timeout=30000)
        await asyncio.sleep(5)
    
    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()
            
asyncio.run(run_test())
    