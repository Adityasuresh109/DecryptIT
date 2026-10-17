from pathlib import Path
import asyncio,base64
from playwright.async_api import async_playwright
root=Path(__file__).resolve().parents[1]/'frontend'
js=(root/'app.js').read_text();qr=(root/'qr.js').read_text()
js=js.replace("import {qrSVG} from './qr.js';", "import {qrSVG} from 'data:text/javascript;base64,"+base64.b64encode(qr.encode()).decode()+"';")
page_html=f'''<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>{(root/'style.css').read_text()}</style><script>window.AGENCY_WORKER_URL='';</script></head><body><div class="grain"></div><div id="app"></div><div id="toast" class="toast" role="alert" hidden></div><script type="module">{js}</script></body></html>'''
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  for name,viewport in [('desktop',{'width':1280,'height':900}),('phone',{'width':390,'height':844})]:
   page=await browser.new_page(viewport=viewport)
   errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
   await page.set_content(page_html,wait_until='load')
   await page.wait_for_timeout(250)
   assert await page.get_by_text('The Agency.',exact=True).count()==1
   assert await page.locator('button.pack').count()==3
   await page.screenshot(path=str(Path(__file__).resolve().parent/f'{name}-smoke.png'),full_page=True)
   await page.locator('[data-act="how"]').first.click()
   assert await page.get_by_text('YOUR BRIEFING').count()==1
   print(name,'page errors',errors,'buttons',await page.locator('button').count())
   assert not errors
   await page.close()
  await browser.close()
asyncio.run(main())
