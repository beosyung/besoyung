"""Run against a running npm start. Set TEST_URL or CHROMIUM if needed."""
import os, random, shutil
from playwright.sync_api import sync_playwright, expect
url=os.environ.get('TEST_URL','http://localhost:3000')
rng=random.Random(27)
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.getenv('CHROMIUM') or shutil.which('chromium'),args=['--no-sandbox'])
    a=browser.new_context().new_page()
    mobile=browser.new_context(viewport={'width':375,'height':812},is_mobile=True,has_touch=True)
    b=mobile.new_page()
    a.goto(url)
    a.locator('#nick').fill('선공');a.locator('#create').click()
    expect(a.locator('#title')).to_have_text('상대를 기다리는 중')
    invite=a.url;code=invite.split('room=')[1]
    assert len(code)==6 and code.isdigit()
    b.goto(invite);b.locator('#nick').fill('후공');b.locator('#join').tap()
    expect(a.locator('#players')).to_contain_text('후공')
    def state(p):return p.request.get(url+'/state?room='+code).json()
    def invalid(p,**params):
        initial=state(p)
        r=p.request.post(url+'/act',data=dict(code=code,version=initial['version'],**params))
        assert not r.ok and state(p)['game']==initial['game']
    outsider=browser.new_context().request
    assert not outsider.post(url+'/join',data={'code':code,'name':'구경꾼'}).ok
    invalid(b,type='place',at=0)
    for i,p in enumerate([a,b,b,a]):
        loc=p.locator(f'rect[data-at="{i}"][role=button]')
        loc.tap() if p==b else loc.click()
        for page in [a,b]:expect(page.locator('.token')).to_have_count(5+i)
    def positions(p):return p.locator('.token').evaluate_all('(els)=>els.map(e=>[e.dataset.cell,e.dataset.owner,e.dataset.shape])')
    assert positions(a)==positions(b) and len(set(k[0] for k in positions(a)))==8
    invalid(a,type='move',at=48,**{'from':8})
    box=b.locator('#board').bounding_box()
    assert box['x']>=0 and box['x']+box['width']<=375
    count=0
    while True:
        snap=state(a);g=snap['game']
        if g['phase']=='done':break
        assert count<84
        p=[a,b][g['turn']]
        # Choose only through real board controls, including mobile touch events.
        def press(loc):loc.tap() if p==b else loc.click()
        tokens=p.locator('.token[role=button]');tokens.first.wait_for()
        candidates=tokens.all();rng.shuffle(candidates)
        for token in candidates:
            press(token);targets=p.locator('rect[aria-label$=" 이동"]').all()
            if targets:break
        press(rng.choice(targets))
        cand=p.locator('.candidate');cand.first.wait_for()
        if count==0:
            invalid(p,type='wall',at=-1)
            before=state(p)['game'];p.reload();cand.first.wait_for();assert state(p)['game']==before
        press(rng.choice(cand.all()))
        for page in [a,b]:expect(page.locator('.newwall')).to_have_count(count+1)
        assert positions(a)==positions(b)
        count+=1
    assert state(a)['area']==state(b)['area']
    for page in [a,b]:expect(page.locator('#title')).to_have_text('대국 종료')
    print('full match:',count,'walls;',state(a)['area']['scores'],g['reason'], flush=True)
    a.locator('#again').click();b.locator('#again').tap()
    for page in [a,b]:expect(page.locator('.token')).to_have_count(4)
    print('rematch passed', flush=True)
    browser.close()
