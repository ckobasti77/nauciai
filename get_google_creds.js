async function main() {
  const { pathToFileURL } = await import("node:url");
  const playwrightUrl = pathToFileURL(
    "C:\\Users\\admin\\AppData\\Roaming\\npm\\node_modules\\@playwright\\mcp\\node_modules\\playwright-core\\index.js",
  ).href;
  const { chromium } = await import(playwrightUrl);

  console.log("Launching Chrome with copied user data directory...");
  let context;
  try {
    context = await chromium.launchPersistentContext(
      'C:\\Users\\admin\\AppData\\Local\\Temp\\chrome-copy',
      {
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: true,
      }
    );
    console.log("Browser context launched successfully.");
    
    const page = await context.newPage();
    console.log("Navigating to Google Cloud Console Credentials page...");
    await page.goto('https://console.cloud.google.com/apis/credentials', { waitUntil: 'networkidle', timeout: 30000 });
    console.log("Navigation finished. Current URL:", page.url());
    
    // Take a screenshot
    console.log("Taking screenshot...");
    await page.screenshot({ path: 'google_creds.png' });
    console.log("Screenshot saved to google_creds.png.");
    
    const title = await page.title();
    console.log("Page title:", title);
  } catch (error) {
    console.error("An error occurred during browser automation:", error);
  } finally {
    if (context) {
      console.log("Closing browser context...");
      await context.close();
    }
  }
}

main();
