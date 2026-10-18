CREATE FUNCTION pg_temp.expect_failure(command text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE failed boolean := false;
BEGIN
  BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN failed := true; END;
  IF NOT failed THEN RAISE EXCEPTION 'expected constraint rejection: %', command; END IF;
END $$;
CREATE FUNCTION pg_temp.assert_true(value boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion failed: %', label; END IF; END $$;
INSERT INTO accounts(id, role, nickname) VALUES
  ('10000000-0000-0000-0000-000000000001', 'citizen', '시민A'),
  ('10000000-0000-0000-0000-000000000002', 'citizen', '시민B'),
  ('10000000-0000-0000-0000-000000000003', 'staff', '의원실'),
  ('10000000-0000-0000-0000-000000000004', 'staff', '의원실');
SELECT pg_temp.expect_failure($s$INSERT INTO accounts(role,nickname) VALUES ('citizen','시민A')$s$);
SELECT pg_temp.expect_failure($s$UPDATE accounts SET role='citizen', nickname='시민A' WHERE id='10000000-0000-0000-0000-000000000003'$s$);
UPDATE accounts SET role='staff' WHERE id='10000000-0000-0000-0000-000000000002';
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM account_role_history WHERE account_id='10000000-0000-0000-0000-000000000002'), 'role history');
UPDATE accounts SET role='citizen' WHERE id='10000000-0000-0000-0000-000000000002';
INSERT INTO regions(code,name,parent_code) VALUES ('test-city','시',NULL),('test-district','구','test-city'),('test-dong','동','test-district'),('test-other','다른 동','test-district');
SELECT pg_temp.expect_failure($s$UPDATE regions SET parent_code='test-dong' WHERE code='test-city'$s$);
SELECT pg_temp.assert_true(ST_DWithin(ST_SetSRID(ST_Point(127,37),4326)::geography,ST_SetSRID(ST_Point(127,37.001),4326)::geography,500), 'PostGIS 500m distance');
INSERT INTO region_certifications VALUES ('10000000-0000-0000-0000-000000000001',1,'test-dong',now(),now()+interval '1 year');
SELECT pg_temp.expect_failure($s$INSERT INTO region_certifications VALUES ('10000000-0000-0000-0000-000000000001',3,'test-other',now(),now()+interval '1 year')$s$);
SELECT pg_temp.assert_true(citizen_can_participate('10000000-0000-0000-0000-000000000001','test-district'), 'ancestor participation');
SELECT pg_temp.assert_true(NOT citizen_can_participate('10000000-0000-0000-0000-000000000001','test-other'), 'sibling denied');
SELECT pg_temp.assert_true(NOT citizen_can_participate('10000000-0000-0000-0000-000000000003','test-district'), 'staff cannot vote');
INSERT INTO posts(id,author_id,author_role_at_creation,author_name_at_creation,region_code,kind,body) VALUES
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','staff','의원실','test-district','opinion','의견을 들려주세요'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','citizen','시민A','test-dong','request','요청'),
 ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003','staff','의원실','test-district','opinion','마감 테스트');
SELECT pg_temp.expect_failure($s$UPDATE posts SET body=repeat('가',2001) WHERE id='20000000-0000-0000-0000-000000000001'$s$);
SELECT pg_temp.expect_failure($s$UPDATE posts SET photos='[1,2,3,4,5]' WHERE id='20000000-0000-0000-0000-000000000001'$s$);
INSERT INTO replies(id,post_id,author_id,author_role_at_creation,author_name_at_creation,body) VALUES
 ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','citizen','시민A','답글');
SELECT pg_temp.expect_failure($s$UPDATE posts SET pinned_reply_id='30000000-0000-0000-0000-000000000001' WHERE id='20000000-0000-0000-0000-000000000002'$s$);
UPDATE posts SET pinned_reply_id='30000000-0000-0000-0000-000000000001' WHERE id='20000000-0000-0000-0000-000000000001';
SELECT pg_temp.expect_failure($s$UPDATE replies SET parent_id=id WHERE id='30000000-0000-0000-0000-000000000001'$s$);
INSERT INTO surveys(id,post_id,question,choices,mode,closes_at) VALUES
 ('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','어떤 시간?',ARRAY['평일','주말'],'single',now()+interval '1 day');
SELECT pg_temp.expect_failure($s$UPDATE surveys SET question='새 질문' WHERE id='40000000-0000-0000-0000-000000000001'$s$);
SELECT pg_temp.expect_failure($s$DELETE FROM surveys WHERE id='40000000-0000-0000-0000-000000000001'$s$);
UPDATE posts SET body='수정한 본문' WHERE id='20000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true((SELECT edited_at IS NOT NULL FROM posts WHERE id='20000000-0000-0000-0000-000000000001'), 'body edit timestamp');
SELECT pg_temp.assert_true((SELECT question='어떤 시간?' FROM surveys WHERE id='40000000-0000-0000-0000-000000000001'), 'survey unchanged');
SELECT pg_temp.expect_failure($s$INSERT INTO survey_responses VALUES ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003',ARRAY[0],now())$s$);
SELECT pg_temp.expect_failure($s$INSERT INTO survey_responses VALUES ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',ARRAY[0,1],now())$s$);
INSERT INTO survey_responses VALUES ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',ARRAY[0],now());
UPDATE survey_responses SET selected_indexes=ARRAY[1] WHERE survey_id='40000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM survey_responses), 'response replaces existing vote');
SELECT pg_temp.expect_failure($s$DELETE FROM survey_responses WHERE survey_id='40000000-0000-0000-0000-000000000001'$s$);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public_survey_results), 'results hidden before close');
INSERT INTO surveys(id,post_id,question,choices,mode,closes_at) VALUES
 ('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000003','마감?',ARRAY['예','아니요'],'multiple',clock_timestamp()+interval '500 milliseconds');
INSERT INTO survey_responses VALUES ('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',ARRAY[0,1],now());
SELECT pg_sleep(0.6);
SELECT pg_temp.expect_failure($s$INSERT INTO survey_responses VALUES ('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',ARRAY[0],now())$s$);
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public_survey_results WHERE survey_id='40000000-0000-0000-0000-000000000002'), 'public results after deadline');
SELECT pg_temp.assert_true((SELECT bool_and(response_count=1 AND participant_count=1) FROM public_survey_results WHERE survey_id='40000000-0000-0000-0000-000000000002'), 'multiple choice counts each participant once');
UPDATE region_certifications SET verified_at=now()-interval '2 years',expires_at=now()-interval '1 year' WHERE account_id='10000000-0000-0000-0000-000000000001';
SELECT pg_temp.expect_failure($s$UPDATE survey_responses SET selected_indexes=ARRAY[0] WHERE survey_id='40000000-0000-0000-0000-000000000001'$s$);
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='region_certifications' AND column_name IN ('latitude','longitude','coordinates','gps')), 'no persisted user coordinates');

UPDATE replies SET visibility='deleted' WHERE id='30000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true((SELECT pinned_reply_id IS NULL FROM posts WHERE id='20000000-0000-0000-0000-000000000001'), 'removed reply clears pin');
INSERT INTO replies(id,post_id,author_id,author_role_at_creation,author_name_at_creation,body) VALUES
 ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','staff','의원실','공식 답변');
SELECT pg_temp.expect_failure($s$DELETE FROM posts WHERE id='20000000-0000-0000-0000-000000000002'$s$);
UPDATE posts SET visibility='deleted' WHERE id='20000000-0000-0000-0000-000000000002';
SELECT pg_temp.assert_true((SELECT body='' FROM posts WHERE id='20000000-0000-0000-0000-000000000002'), 'deleted body redacted');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM replies WHERE post_id='20000000-0000-0000-0000-000000000002'), 'official answer preserved');
