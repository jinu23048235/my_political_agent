"""Optional local check: BROWSER_CHECK=1 npm run test:integration. Needs Playwright + Chromium."""
import json
import sys
from playwright.sync_api import sync_playwright
config=json.load(sys.stdin)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    errors=[]
    context=browser.new_context(viewport={'width':390,'height':844})
    context.add_cookies([{'name':'neighborhood_session','value':config['tokens']['a'],'url':config['origin'],'httpOnly':True,'sameSite':'Lax'}])
    page=context.new_page()
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(config['origin']+'/write')
    page.locator('#region').select_option('seongsan1')
    page.locator('#post-body').fill('브라우저에서 작성한 우리 동네 이야기')
    page.get_by_role('button',name='이야기 등록').click()
    page.wait_for_url('**/posts/**')
    page.get_by_text('브라우저에서 작성한 우리 동네 이야기',exact=True).wait_for()
    page.locator('#reply-body').fill('화면에서 남긴 댓글')
    page.get_by_role('button',name='답글 등록').click()
    page.get_by_text('화면에서 남긴 댓글',exact=True).wait_for()
    page.get_by_role('button',name='댓글 고정',exact=True).click()
    page.get_by_text('⌖ 고정 댓글',exact=True).wait_for()
    assert page.get_by_text('화면에서 남긴 댓글',exact=True).count()==1
    page.goto(config['origin']+'/posts/'+config['surveyPostId'])
    page.get_by_label('평일',exact=True).check()
    page.get_by_label('주말',exact=True).uncheck()
    page.get_by_role('button',name='선택 변경',exact=True).click()
    page.get_by_role('status').filter(has_text='선택을 저장했어요').wait_for()
    page.reload()
    assert page.get_by_label('평일',exact=True).is_checked()
    assert not page.get_by_label('주말',exact=True).is_checked()
    page.goto(config['origin']+'/settings')
    page.locator('#nickname').fill('브라우저닉네임')
    page.get_by_role('button',name='설정 저장').click()
    page.get_by_role('status').filter(has_text='저장했어요').wait_for()
    for width in [320,390,768,1440]:
        page.set_viewport_size({'width':width,'height':900})
        for path in ['/?region=mapo','/write','/settings','/posts/'+config['postId']]:
            page.goto(config['origin']+path)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),(width,path)
        if width==320:
            assert page.locator('.mobile-nav a').last.inner_text()=='설정'
    assert not errors,errors
    context.close()
    browser.close()
print('PASS: Chromium writing/replies/pin/survey/settings and 320–1440px layouts.')
