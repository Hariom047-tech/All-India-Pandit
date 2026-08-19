-- GENERATED FILE — do not edit by hand.
-- Source: backend/src/data/*.json, via backend/scripts/generate-seed-sql.js
-- Content hash: 0abde4e2057477a1192c8251fb0c1303337c7b31

-- system/editorial user (blog authorship)
INSERT INTO users (id, email, phone, password_hash, full_name, role, status, email_verified, phone_verified)
     VALUES ('d7943536-ef8b-5d7f-aeac-7bc0e2ac13ed', 'admin@panditconnect.demo', NULL, '$2a$10$/rI1Tv/I8AqUANqddIo6t.SwzUjWLN/09RvLRmStBgoravFBun5ym', 'PanditConnect Editorial', 'admin', 'active', TRUE, FALSE);

-- service_categories (derived from distinct services[].cat)
INSERT INTO service_categories (id, name, slug, display_order) VALUES ('8f58bc36-d272-523d-ab61-22e50904b39e', 'life', 'life', 0);
INSERT INTO service_categories (id, name, slug, display_order) VALUES ('ba447654-0409-5958-bd7d-d55e99faef97', 'daily', 'daily', 1);
INSERT INTO service_categories (id, name, slug, display_order) VALUES ('3f34c876-080f-55c9-99fe-986844908181', 'shanti', 'shanti', 2);
INSERT INTO service_categories (id, name, slug, display_order) VALUES ('dc780892-3755-5141-b390-69f16672b9ff', 'festival', 'festival', 3);

-- services (slug preserves the old id, so /api/services/:id URLs are unchanged)
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('06a148ae-df90-5d9b-b5f4-768e9002c13b', '8f58bc36-d272-523d-ab61-22e50904b39e', 'Griha Pravesh', 'griha-pravesh', 'Vastu Shanti and Griha Pravesh puja performed before entering a new home, invoking Ganesh, Vastu Purush and the nine planets for peace and prosperity.', 'Vastu Shanti and Griha Pravesh puja performed before entering a new home, invoking Ganesh, Vastu Purush and the nine planets for peace and prosperity.', 'home', '3–4 hours', '["Kalash with copper vessel","Coconut with husk","Mango leaves","Roli, haldi, akshat","Cow ghee & camphor","Havan samagri 500g","Navgrah samidha","Red cloth (1m)","Panchamrit ingredients","Fresh flowers & garland"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('53bc7f66-eca7-5e6c-b2f0-90a46f2be45a', 'ba447654-0409-5958-bd7d-d55e99faef97', 'Satyanarayan Katha', 'satyanarayan-katha', 'Recitation of the Shri Satyanarayan Vrat Katha in five chapters, traditionally performed on Purnima or after a wish is fulfilled.', 'Recitation of the Shri Satyanarayan Vrat Katha in five chapters, traditionally performed on Purnima or after a wish is fulfilled.', 'book-open', '2–3 hours', '["Banana leaves & stem","Sapatha (wheat flour, sugar, ghee) for prasad","Panchamrit","Tulsi leaves","Betel leaves & nuts","Kalash & coconut","Yellow cloth","Fruits (5 varieties)"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('9677e915-c2fd-58de-93a8-2aa81ac524af', 'ba447654-0409-5958-bd7d-d55e99faef97', 'Havan / Yagna', 'havan-yagna', 'Fire ritual with Vedic mantra offerings for purification of space and mind. Available as Ganesh, Navgrah, Rudra or Chandi havan.', 'Fire ritual with Vedic mantra offerings for purification of space and mind. Available as Ganesh, Navgrah, Rudra or Chandi havan.', 'flame', '2–5 hours', '["Havan kund","Mango wood samidha 2kg","Havan samagri 1kg","Cow ghee 500g","Camphor & kapoor","Black sesame & barley","Guggul & loban","Purnahuti coconut"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('3333357a-4d3a-527b-b4e8-0dd61a5f5a9a', '8f58bc36-d272-523d-ab61-22e50904b39e', 'Wedding Ceremony', 'wedding', 'Complete Vivah Sanskar — Ganesh puja, Kanyadaan, Panigrahan, Saptapadi and Sindoor daan, performed per your family tradition (Gotra-specific).', 'Complete Vivah Sanskar — Ganesh puja, Kanyadaan, Panigrahan, Saptapadi and Sindoor daan, performed per your family tradition (Gotra-specific).', 'rings', '4–6 hours', '["Mandap samagri set","Havan kund & samidha","Mangalsutra & sindoor","Varmala (2)","Kalash (4)","Ganesh-Gauri idols","Red & yellow cloth","Puffed rice (laja) 1kg"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('b74daca0-9d20-568e-aea9-9036f6f907eb', '8f58bc36-d272-523d-ab61-22e50904b39e', 'Mundan Ceremony', 'mundan', 'Chudakarana Sanskar — the child''s first tonsure, performed at a temple or home on an auspicious muhurat for health and long life.', 'Chudakarana Sanskar — the child''s first tonsure, performed at a temple or home on an auspicious muhurat for health and long life.', 'scissors', '1–2 hours', '["Kalash & coconut","Ganga jal","Silver razor (or barber kit)","Turmeric paste","Sweet prasad","New clothes for child","Flowers & akshat"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('30af3b0c-91ac-5cb0-8167-c853844a6cfd', 'ba447654-0409-5958-bd7d-d55e99faef97', 'Sunderkand Path', 'sunderkand', 'Melodious recitation of the Sunderkand from Ramcharitmanas with dholak and manjira — a favourite for removing obstacles and fear.', 'Melodious recitation of the Sunderkand from Ramcharitmanas with dholak and manjira — a favourite for removing obstacles and fear.', 'book-open', '3 hours', '["Hanuman ji idol/picture","Sindoor & chameli oil","Boondi laddoo prasad","Red flag & cloth","Diya & ghee","Tulsi mala","Banana & jaggery"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('1c5de8aa-27a3-5aba-aa4b-6e86baf88b33', '3f34c876-080f-55c9-99fe-986844908181', 'Rudrabhishek', 'rudrabhishek', 'Abhishek of the Shivling with panchamrit while chanting the Rudri path — highly recommended on Mondays, Pradosh and Shivratri.', 'Abhishek of the Shivling with panchamrit while chanting the Rudri path — highly recommended on Mondays, Pradosh and Shivratri.', 'trishul', '2–3 hours', '["Panchamrit (milk, curd, ghee, honey, sugar)","Bel patra 108","Dhatura & bhang","White flowers","Gangajal","Bhasma & chandan","Black sesame"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('bbb8c252-9415-578a-aedb-59a584806ca6', '3f34c876-080f-55c9-99fe-986844908181', 'Navgraha Shanti', 'navgrah-shanti', 'Graha shanti havan with planet-specific mantra japa and daan, prescribed from your janm kundali to reduce malefic planetary effects.', 'Graha shanti havan with planet-specific mantra japa and daan, prescribed from your janm kundali to reduce malefic planetary effects.', 'sparkles', '3–4 hours', '["Nine grains (nav dhanya)","Nine samidha woods","Nine cloth pieces","Navratna or substitutes","Havan samagri","Til, jau, ghee","Daan items per planet"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('994d8b80-ceb7-55ac-830f-295e83466106', 'ba447654-0409-5958-bd7d-d55e99faef97', 'Ganesh Puja', 'ganesh-puja', 'Shri Ganesh Sthapana and Atharvashirsha path — the mandatory opening ritual for every auspicious beginning.', 'Shri Ganesh Sthapana and Atharvashirsha path — the mandatory opening ritual for every auspicious beginning.', 'om', '1–2 hours', '["Ganesh idol (clay)","Durva grass 21","Modak prasad","Red flowers","Sindoor","Kalash & coconut"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('40092c7a-3739-51c2-a4be-06861f21b31d', '8f58bc36-d272-523d-ab61-22e50904b39e', 'Namkaran Sanskar', 'namkaran', 'Naming ceremony on the 11th/12th day, with nakshatra-based name suggestion, Surya darshan and blessings for the newborn.', 'Naming ceremony on the 11th/12th day, with nakshatra-based name suggestion, Surya darshan and blessings for the newborn.', 'baby', '1–2 hours', '["Honey & gold ring","Kalash & mango leaves","Cradle decoration","Panchamrit","Akshat & haldi","Sweet prasad"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('9556a5f0-29d5-52e0-9e9b-8eeebb74bf3a', '8f58bc36-d272-523d-ab61-22e50904b39e', 'Annaprashan', 'annaprashan', 'The baby''s first rice ceremony performed on a shubh muhurat with kheer prepared in silver, followed by blessings from elders.', 'The baby''s first rice ceremony performed on a shubh muhurat with kheer prepared in silver, followed by blessings from elders.', 'kalash', '1 hour', '["Silver bowl & spoon","Kheer ingredients","Kalash","Fruits & flowers","New clothes"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('77e16ac4-64c1-5d26-a30c-c92f0a9f866c', '3f34c876-080f-55c9-99fe-986844908181', 'Vastu Shanti', 'satyanarayan-vrat', 'Vastu dosh nivaran puja with Vastu Purush mandala, for homes, shops and offices facing recurring problems.', 'Vastu dosh nivaran puja with Vastu Purush mandala, for homes, shops and offices facing recurring problems.', 'shield-check', '2–3 hours', '["Vastu yantra","Copper kalash","Nav dhanya","Havan samagri","Red cloth","Panchdhatu items"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('550f458b-37ea-544a-b003-2b65d98d23f9', 'dc780892-3755-5141-b390-69f16672b9ff', 'Bhagwat Katha', 'katha-bhagwat', 'Shrimad Bhagwat Mahapuran katha over seven days with vyas peeth, sung by an experienced katha vachak.', 'Shrimad Bhagwat Mahapuran katha over seven days with vyas peeth, sung by an experienced katha vachak.', 'book-open', '7 days', '["Vyas peeth setup","Bhagwat granth","Tulsi mala","Peacock feather & flute","Chhappan bhog items","Mandap decoration"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('76ef4675-410c-51ec-aec9-a2635e9d7b2e', '3f34c876-080f-55c9-99fe-986844908181', 'Durga Saptashati Path', 'durga-path', 'Complete 700-verse Durga Saptashati recitation with Kavach, Argala and Keelak — powerful during Navratri.', 'Complete 700-verse Durga Saptashati recitation with Kavach, Argala and Keelak — powerful during Navratri.', 'flame', '4–6 hours', '["Durga idol/picture","Red chunri & bangles","Coconut & kalash","Red flowers (hibiscus)","Havan samagri","Kumkum & sindoor"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('a977f744-ac67-5fb3-8cfa-c62a377b9da2', '3f34c876-080f-55c9-99fe-986844908181', 'Mahamrityunjay Jaap', 'mahamrityunjay', 'Sankalp-based Mahamrityunjay mantra japa (11,000 / 1.25 lakh) for recovery from illness and protection from untimely danger.', 'Sankalp-based Mahamrityunjay mantra japa (11,000 / 1.25 lakh) for recovery from illness and protection from untimely danger.', 'trishul', '3–5 hours', '["Rudraksh mala","Shivling","Bel patra & white flowers","Milk & gangajal","Havan samagri","Black til"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('479c2055-e98f-52b6-bb70-eb1ab7e704e1', 'dc780892-3755-5141-b390-69f16672b9ff', 'Akhand Ramayan Path', 'satyanarayan-akhand', 'Non-stop 24-hour Ramcharitmanas recitation by a team of pandits, ending with havan and bhandara.', 'Non-stop 24-hour Ramcharitmanas recitation by a team of pandits, ending with havan and bhandara.', 'book-open', '24 hours', '["Ramcharitmanas granth","Team seating arrangement","Akhand diya","Havan kund","Bhog & prasad","Flowers & garlands"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('742bcb1e-9f75-5ef0-b61a-00f76d8655ca', '3f34c876-080f-55c9-99fe-986844908181', 'Kaal Sarp Dosh Puja', 'kaal-sarp', 'Specialised Kaal Sarp Yog nivaran puja, traditionally performed at Trimbakeshwar or Ujjain with Naag pratishtha.', 'Specialised Kaal Sarp Yog nivaran puja, traditionally performed at Trimbakeshwar or Ujjain with Naag pratishtha.', 'alert-circle', '3–4 hours', '["Silver naag-naagin pair","Rudraksh","Black til & urad","Havan samagri","Blue/black cloth","Coconut"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('9b2e0d02-a574-5016-838a-f26ae25849ac', '3f34c876-080f-55c9-99fe-986844908181', 'Pitru Dosh / Shradh', 'pitru-dosh', 'Shradh, Tarpan and Pind daan for ancestral peace — performed during Pitru Paksha or on the tithi of passing.', 'Shradh, Tarpan and Pind daan for ancestral peace — performed during Pitru Paksha or on the tithi of passing.', 'moon', '2–4 hours', '["Black til & jau","Kush grass","Rice pind ingredients","Ganga jal","White cloth","Brahman bhoj arrangement"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('2b2ea34a-4a98-59b7-b6da-87507ccef7db', '8f58bc36-d272-523d-ab61-22e50904b39e', 'Janeu / Upanayan', 'janeu', 'Yagyopavit Sanskar with Gayatri mantra diksha, marking the start of Vedic study for the child.', 'Yagyopavit Sanskar with Gayatri mantra diksha, marking the start of Vedic study for the child.', 'award', '3–4 hours', '["Yagyopavit (janeu) set","Danda & mriga charm","Havan kund & samidha","Kaupin & dhoti","Bhiksha items","Kalash"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('4ea6d01a-ca07-5ce8-bd8e-ebffade3672b', '8f58bc36-d272-523d-ab61-22e50904b39e', 'Bhoomi Pujan', 'bhoomi-pujan', 'Shilanyas and Bhoomi Pujan before construction begins — worship of Bhoomi Devi, Naag devta and the eight directions.', 'Shilanyas and Bhoomi Pujan before construction begins — worship of Bhoomi Devi, Naag devta and the eight directions.', 'temple', '2 hours', '["Silver naag & kalash","Foundation brick/shila","Nav dhanya","Panchdhatu","Coconut & flowers","Havan samagri"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('56b6a10e-594f-547c-8089-b018eda82497', 'ba447654-0409-5958-bd7d-d55e99faef97', 'Gau Puja & Daan', 'gau-puja', 'Gau puja with feeding and daan, considered highly meritorious — often paired with Govardhan puja or Gopashtami.', 'Gau puja with feeding and daan, considered highly meritorious — often paired with Govardhan puja or Gopashtami.', 'sparkles', '1 hour', '["Green fodder & jaggery","Haldi & kumkum","Garland for cow","Diya & agarbatti","Cloth for daan"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('a0c98bfd-c567-53a3-98c0-93df7b157fd5', 'dc780892-3755-5141-b390-69f16672b9ff', 'Lakshmi Puja (Diwali)', 'satyanarayan-diwali', 'Shri Lakshmi-Ganesh puja with Kuber and bahi-khata pujan on Diwali night at the shubh Pradosh muhurat.', 'Shri Lakshmi-Ganesh puja with Kuber and bahi-khata pujan on Diwali night at the shubh Pradosh muhurat.', 'diya', '1–2 hours', '["Lakshmi-Ganesh idols","Lotus flowers","Kamal gatta mala","Silver coin","Kheel-batasha","Bahi khata & pen","11 diyas"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('301053d0-abcb-5fe3-a4d3-f34f463d7eaf', 'dc780892-3755-5141-b390-69f16672b9ff', 'Navratri Kalash Sthapana', 'navratri-sthapana', 'Ghatasthapana on Pratipada with jawara sowing, akhand jyoti and daily aarti arrangement through nine nights.', 'Ghatasthapana on Pratipada with jawara sowing, akhand jyoti and daily aarti arrangement through nine nights.', 'kalash', '1–2 hours', '["Clay pot & soil","Barley seeds (jawara)","Kalash & coconut","Red chunri","Akhand jyoti diya","Nine-day flowers"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('e2a08f68-0e01-5c2d-ab63-ebcc14dbbb03', 'dc780892-3755-5141-b390-69f16672b9ff', 'Ganesh Utsav Sthapana', 'ganesh-utsav', 'Pranpratishtha of the Ganesh idol on Chaturthi with daily aarti schedule and visarjan guidance.', 'Pranpratishtha of the Ganesh idol on Chaturthi with daily aarti schedule and visarjan guidance.', 'om', '2 hours', '["Ganesh idol","Durva & modak","Red flowers","Decoration set","Kalash","Aarti thali"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('64385023-a98b-52c8-a0cc-26531056bbaf', 'dc780892-3755-5141-b390-69f16672b9ff', 'Holika Dahan Puja', 'holika-dahan', 'Holika puja and dahan at the correct Bhadra-free muhurat with parikrama and new-grain offering.', 'Holika puja and dahan at the correct Bhadra-free muhurat with parikrama and new-grain offering.', 'flame', '1 hour', '["Cow dung cakes","Wheat sheaves","Gulal & haldi","Coconut","Kalava thread","Water pot"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('56da7ba6-697d-532a-ae6f-e596255a733e', 'dc780892-3755-5141-b390-69f16672b9ff', 'Chhath Puja Vidhi', 'chhath', 'Guided Chhath vidhi across Nahay-Khay, Kharna, Sandhya Arghya and Usha Arghya with Surya mantras.', 'Guided Chhath vidhi across Nahay-Khay, Kharna, Sandhya Arghya and Usha Arghya with Surya mantras.', 'sun', '2 days', '["Bamboo soop & daura","Thekua prasad","Sugarcane","Seasonal fruits","Diya & agarbatti","Sindoor"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('e17144c1-8f56-59b4-91c4-9a8e2e70872d', 'dc780892-3755-5141-b390-69f16672b9ff', 'Mata Ka Jagran', 'katha-jagran', 'Devi jagran with chowki, bhajan mandali, akhand jyoti and morning bhandara arrangement.', 'Devi jagran with chowki, bhajan mandali, akhand jyoti and morning bhandara arrangement.', 'flame', '6–8 hours', '["Chowki decoration","Devi idols/pictures","Akhand jyoti","Bhajan mandali setup","Prasad & bhandara","Red chunri"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('f14af272-f9fd-5ea4-9ff7-cda0374fdc80', '3f34c876-080f-55c9-99fe-986844908181', 'Kundali & Matchmaking', 'kundali', 'Janm kundali preparation, dasha analysis and 36-guna matching for marriage with written report.', 'Janm kundali preparation, dasha analysis and 36-guna matching for marriage with written report.', 'globe', '1 hour', '["Birth date, time & place","Both kundalis (for milan)","Notebook for remedies"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('c6029093-3a6f-5aa0-a38d-d88117ad378d', 'ba447654-0409-5958-bd7d-d55e99faef97', 'Daily Aarti Seva', 'aarti-seva', 'Arrange daily, weekly or monthly aarti and abhishek seva in your name at a listed temple with photo confirmation.', 'Arrange daily, weekly or monthly aarti and abhishek seva in your name at a listed temple with photo confirmation.', 'diya', '30 min', '["Ghee for diya","Flowers & garland","Prasad items","Agarbatti & dhoop"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('d9b011e0-0cbf-5d0a-995e-9c30148e718b', '8f58bc36-d272-523d-ab61-22e50904b39e', 'Antim Sanskar', 'antim-sanskar', 'Respectful guidance and pandit availability for Antim Sanskar, Asthi visarjan and the 13-day rites.', 'Respectful guidance and pandit availability for Antim Sanskar, Asthi visarjan and the 13-day rites.', 'moon', 'As needed', '["Kush & til","Ganga jal","White cloth","Havan samagri","Pind daan items"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('726b9c60-e3ba-50cd-a451-349aff410f01', '8f58bc36-d272-523d-ab61-22e50904b39e', 'Shop / Office Opening', 'shop-opening', 'Lakshmi-Kuber puja with Vastu shanti for a new shop, office or factory at a business-friendly muhurat.', 'Lakshmi-Kuber puja with Vastu shanti for a new shop, office or factory at a business-friendly muhurat.', 'briefcase', '1–2 hours', '["Lakshmi-Ganesh idols","Kalash & coconut","Cash box & bahi khata","Nimbu-mirchi & toran","Havan samagri"]'::jsonb, TRUE);
INSERT INTO services (id, category_id, name, slug, description, short_description, icon_name, estimated_duration, samagri_list, is_active)
       VALUES ('d4c0d2c2-9bdd-554f-ac1b-117da63fa953', '3f34c876-080f-55c9-99fe-986844908181', 'Shani Shanti Puja', 'satyanarayan-shanti', 'Shani shanti with til-tel abhishek and Shani stotra japa, advised during Shani Mahadasha or Sade Sati.', 'Shani shanti with til-tel abhishek and Shani stotra japa, advised during Shani Mahadasha or Sade Sati.', 'moon', '2 hours', '["Black til & mustard oil","Black cloth & urad dal","Iron item for daan","Blue flowers","Havan samagri"]'::jsonb, TRUE);

-- service_samagri (one row per samagri item)
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('06a148ae-df90-5d9b-b5f4-768e9002c13b', 'Kalash with copper vessel', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('06a148ae-df90-5d9b-b5f4-768e9002c13b', 'Coconut with husk', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('06a148ae-df90-5d9b-b5f4-768e9002c13b', 'Mango leaves', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('06a148ae-df90-5d9b-b5f4-768e9002c13b', 'Roli, haldi, akshat', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('06a148ae-df90-5d9b-b5f4-768e9002c13b', 'Cow ghee & camphor', 4);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('06a148ae-df90-5d9b-b5f4-768e9002c13b', 'Havan samagri 500g', 5);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('06a148ae-df90-5d9b-b5f4-768e9002c13b', 'Navgrah samidha', 6);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('06a148ae-df90-5d9b-b5f4-768e9002c13b', 'Red cloth (1m)', 7);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('06a148ae-df90-5d9b-b5f4-768e9002c13b', 'Panchamrit ingredients', 8);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('06a148ae-df90-5d9b-b5f4-768e9002c13b', 'Fresh flowers & garland', 9);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('53bc7f66-eca7-5e6c-b2f0-90a46f2be45a', 'Banana leaves & stem', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('53bc7f66-eca7-5e6c-b2f0-90a46f2be45a', 'Sapatha (wheat flour, sugar, ghee) for prasad', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('53bc7f66-eca7-5e6c-b2f0-90a46f2be45a', 'Panchamrit', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('53bc7f66-eca7-5e6c-b2f0-90a46f2be45a', 'Tulsi leaves', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('53bc7f66-eca7-5e6c-b2f0-90a46f2be45a', 'Betel leaves & nuts', 4);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('53bc7f66-eca7-5e6c-b2f0-90a46f2be45a', 'Kalash & coconut', 5);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('53bc7f66-eca7-5e6c-b2f0-90a46f2be45a', 'Yellow cloth', 6);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('53bc7f66-eca7-5e6c-b2f0-90a46f2be45a', 'Fruits (5 varieties)', 7);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('9677e915-c2fd-58de-93a8-2aa81ac524af', 'Havan kund', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('9677e915-c2fd-58de-93a8-2aa81ac524af', 'Mango wood samidha 2kg', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('9677e915-c2fd-58de-93a8-2aa81ac524af', 'Havan samagri 1kg', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('9677e915-c2fd-58de-93a8-2aa81ac524af', 'Cow ghee 500g', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('9677e915-c2fd-58de-93a8-2aa81ac524af', 'Camphor & kapoor', 4);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('9677e915-c2fd-58de-93a8-2aa81ac524af', 'Black sesame & barley', 5);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('9677e915-c2fd-58de-93a8-2aa81ac524af', 'Guggul & loban', 6);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('9677e915-c2fd-58de-93a8-2aa81ac524af', 'Purnahuti coconut', 7);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('3333357a-4d3a-527b-b4e8-0dd61a5f5a9a', 'Mandap samagri set', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('3333357a-4d3a-527b-b4e8-0dd61a5f5a9a', 'Havan kund & samidha', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('3333357a-4d3a-527b-b4e8-0dd61a5f5a9a', 'Mangalsutra & sindoor', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('3333357a-4d3a-527b-b4e8-0dd61a5f5a9a', 'Varmala (2)', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('3333357a-4d3a-527b-b4e8-0dd61a5f5a9a', 'Kalash (4)', 4);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('3333357a-4d3a-527b-b4e8-0dd61a5f5a9a', 'Ganesh-Gauri idols', 5);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('3333357a-4d3a-527b-b4e8-0dd61a5f5a9a', 'Red & yellow cloth', 6);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('3333357a-4d3a-527b-b4e8-0dd61a5f5a9a', 'Puffed rice (laja) 1kg', 7);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('b74daca0-9d20-568e-aea9-9036f6f907eb', 'Kalash & coconut', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('b74daca0-9d20-568e-aea9-9036f6f907eb', 'Ganga jal', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('b74daca0-9d20-568e-aea9-9036f6f907eb', 'Silver razor (or barber kit)', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('b74daca0-9d20-568e-aea9-9036f6f907eb', 'Turmeric paste', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('b74daca0-9d20-568e-aea9-9036f6f907eb', 'Sweet prasad', 4);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('b74daca0-9d20-568e-aea9-9036f6f907eb', 'New clothes for child', 5);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('b74daca0-9d20-568e-aea9-9036f6f907eb', 'Flowers & akshat', 6);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('30af3b0c-91ac-5cb0-8167-c853844a6cfd', 'Hanuman ji idol/picture', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('30af3b0c-91ac-5cb0-8167-c853844a6cfd', 'Sindoor & chameli oil', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('30af3b0c-91ac-5cb0-8167-c853844a6cfd', 'Boondi laddoo prasad', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('30af3b0c-91ac-5cb0-8167-c853844a6cfd', 'Red flag & cloth', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('30af3b0c-91ac-5cb0-8167-c853844a6cfd', 'Diya & ghee', 4);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('30af3b0c-91ac-5cb0-8167-c853844a6cfd', 'Tulsi mala', 5);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('30af3b0c-91ac-5cb0-8167-c853844a6cfd', 'Banana & jaggery', 6);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('1c5de8aa-27a3-5aba-aa4b-6e86baf88b33', 'Panchamrit (milk, curd, ghee, honey, sugar)', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('1c5de8aa-27a3-5aba-aa4b-6e86baf88b33', 'Bel patra 108', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('1c5de8aa-27a3-5aba-aa4b-6e86baf88b33', 'Dhatura & bhang', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('1c5de8aa-27a3-5aba-aa4b-6e86baf88b33', 'White flowers', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('1c5de8aa-27a3-5aba-aa4b-6e86baf88b33', 'Gangajal', 4);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('1c5de8aa-27a3-5aba-aa4b-6e86baf88b33', 'Bhasma & chandan', 5);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('1c5de8aa-27a3-5aba-aa4b-6e86baf88b33', 'Black sesame', 6);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('bbb8c252-9415-578a-aedb-59a584806ca6', 'Nine grains (nav dhanya)', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('bbb8c252-9415-578a-aedb-59a584806ca6', 'Nine samidha woods', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('bbb8c252-9415-578a-aedb-59a584806ca6', 'Nine cloth pieces', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('bbb8c252-9415-578a-aedb-59a584806ca6', 'Navratna or substitutes', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('bbb8c252-9415-578a-aedb-59a584806ca6', 'Havan samagri', 4);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('bbb8c252-9415-578a-aedb-59a584806ca6', 'Til, jau, ghee', 5);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('bbb8c252-9415-578a-aedb-59a584806ca6', 'Daan items per planet', 6);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('994d8b80-ceb7-55ac-830f-295e83466106', 'Ganesh idol (clay)', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('994d8b80-ceb7-55ac-830f-295e83466106', 'Durva grass 21', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('994d8b80-ceb7-55ac-830f-295e83466106', 'Modak prasad', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('994d8b80-ceb7-55ac-830f-295e83466106', 'Red flowers', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('994d8b80-ceb7-55ac-830f-295e83466106', 'Sindoor', 4);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('994d8b80-ceb7-55ac-830f-295e83466106', 'Kalash & coconut', 5);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('40092c7a-3739-51c2-a4be-06861f21b31d', 'Honey & gold ring', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('40092c7a-3739-51c2-a4be-06861f21b31d', 'Kalash & mango leaves', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('40092c7a-3739-51c2-a4be-06861f21b31d', 'Cradle decoration', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('40092c7a-3739-51c2-a4be-06861f21b31d', 'Panchamrit', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('40092c7a-3739-51c2-a4be-06861f21b31d', 'Akshat & haldi', 4);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('40092c7a-3739-51c2-a4be-06861f21b31d', 'Sweet prasad', 5);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('9556a5f0-29d5-52e0-9e9b-8eeebb74bf3a', 'Silver bowl & spoon', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('9556a5f0-29d5-52e0-9e9b-8eeebb74bf3a', 'Kheer ingredients', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('9556a5f0-29d5-52e0-9e9b-8eeebb74bf3a', 'Kalash', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('9556a5f0-29d5-52e0-9e9b-8eeebb74bf3a', 'Fruits & flowers', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('9556a5f0-29d5-52e0-9e9b-8eeebb74bf3a', 'New clothes', 4);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('77e16ac4-64c1-5d26-a30c-c92f0a9f866c', 'Vastu yantra', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('77e16ac4-64c1-5d26-a30c-c92f0a9f866c', 'Copper kalash', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('77e16ac4-64c1-5d26-a30c-c92f0a9f866c', 'Nav dhanya', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('77e16ac4-64c1-5d26-a30c-c92f0a9f866c', 'Havan samagri', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('77e16ac4-64c1-5d26-a30c-c92f0a9f866c', 'Red cloth', 4);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('77e16ac4-64c1-5d26-a30c-c92f0a9f866c', 'Panchdhatu items', 5);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('550f458b-37ea-544a-b003-2b65d98d23f9', 'Vyas peeth setup', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('550f458b-37ea-544a-b003-2b65d98d23f9', 'Bhagwat granth', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('550f458b-37ea-544a-b003-2b65d98d23f9', 'Tulsi mala', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('550f458b-37ea-544a-b003-2b65d98d23f9', 'Peacock feather & flute', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('550f458b-37ea-544a-b003-2b65d98d23f9', 'Chhappan bhog items', 4);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('550f458b-37ea-544a-b003-2b65d98d23f9', 'Mandap decoration', 5);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('76ef4675-410c-51ec-aec9-a2635e9d7b2e', 'Durga idol/picture', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('76ef4675-410c-51ec-aec9-a2635e9d7b2e', 'Red chunri & bangles', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('76ef4675-410c-51ec-aec9-a2635e9d7b2e', 'Coconut & kalash', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('76ef4675-410c-51ec-aec9-a2635e9d7b2e', 'Red flowers (hibiscus)', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('76ef4675-410c-51ec-aec9-a2635e9d7b2e', 'Havan samagri', 4);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('76ef4675-410c-51ec-aec9-a2635e9d7b2e', 'Kumkum & sindoor', 5);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('a977f744-ac67-5fb3-8cfa-c62a377b9da2', 'Rudraksh mala', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('a977f744-ac67-5fb3-8cfa-c62a377b9da2', 'Shivling', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('a977f744-ac67-5fb3-8cfa-c62a377b9da2', 'Bel patra & white flowers', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('a977f744-ac67-5fb3-8cfa-c62a377b9da2', 'Milk & gangajal', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('a977f744-ac67-5fb3-8cfa-c62a377b9da2', 'Havan samagri', 4);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('a977f744-ac67-5fb3-8cfa-c62a377b9da2', 'Black til', 5);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('479c2055-e98f-52b6-bb70-eb1ab7e704e1', 'Ramcharitmanas granth', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('479c2055-e98f-52b6-bb70-eb1ab7e704e1', 'Team seating arrangement', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('479c2055-e98f-52b6-bb70-eb1ab7e704e1', 'Akhand diya', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('479c2055-e98f-52b6-bb70-eb1ab7e704e1', 'Havan kund', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('479c2055-e98f-52b6-bb70-eb1ab7e704e1', 'Bhog & prasad', 4);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('479c2055-e98f-52b6-bb70-eb1ab7e704e1', 'Flowers & garlands', 5);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('742bcb1e-9f75-5ef0-b61a-00f76d8655ca', 'Silver naag-naagin pair', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('742bcb1e-9f75-5ef0-b61a-00f76d8655ca', 'Rudraksh', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('742bcb1e-9f75-5ef0-b61a-00f76d8655ca', 'Black til & urad', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('742bcb1e-9f75-5ef0-b61a-00f76d8655ca', 'Havan samagri', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('742bcb1e-9f75-5ef0-b61a-00f76d8655ca', 'Blue/black cloth', 4);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('742bcb1e-9f75-5ef0-b61a-00f76d8655ca', 'Coconut', 5);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('9b2e0d02-a574-5016-838a-f26ae25849ac', 'Black til & jau', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('9b2e0d02-a574-5016-838a-f26ae25849ac', 'Kush grass', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('9b2e0d02-a574-5016-838a-f26ae25849ac', 'Rice pind ingredients', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('9b2e0d02-a574-5016-838a-f26ae25849ac', 'Ganga jal', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('9b2e0d02-a574-5016-838a-f26ae25849ac', 'White cloth', 4);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('9b2e0d02-a574-5016-838a-f26ae25849ac', 'Brahman bhoj arrangement', 5);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('2b2ea34a-4a98-59b7-b6da-87507ccef7db', 'Yagyopavit (janeu) set', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('2b2ea34a-4a98-59b7-b6da-87507ccef7db', 'Danda & mriga charm', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('2b2ea34a-4a98-59b7-b6da-87507ccef7db', 'Havan kund & samidha', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('2b2ea34a-4a98-59b7-b6da-87507ccef7db', 'Kaupin & dhoti', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('2b2ea34a-4a98-59b7-b6da-87507ccef7db', 'Bhiksha items', 4);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('2b2ea34a-4a98-59b7-b6da-87507ccef7db', 'Kalash', 5);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('4ea6d01a-ca07-5ce8-bd8e-ebffade3672b', 'Silver naag & kalash', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('4ea6d01a-ca07-5ce8-bd8e-ebffade3672b', 'Foundation brick/shila', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('4ea6d01a-ca07-5ce8-bd8e-ebffade3672b', 'Nav dhanya', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('4ea6d01a-ca07-5ce8-bd8e-ebffade3672b', 'Panchdhatu', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('4ea6d01a-ca07-5ce8-bd8e-ebffade3672b', 'Coconut & flowers', 4);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('4ea6d01a-ca07-5ce8-bd8e-ebffade3672b', 'Havan samagri', 5);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('56b6a10e-594f-547c-8089-b018eda82497', 'Green fodder & jaggery', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('56b6a10e-594f-547c-8089-b018eda82497', 'Haldi & kumkum', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('56b6a10e-594f-547c-8089-b018eda82497', 'Garland for cow', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('56b6a10e-594f-547c-8089-b018eda82497', 'Diya & agarbatti', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('56b6a10e-594f-547c-8089-b018eda82497', 'Cloth for daan', 4);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('a0c98bfd-c567-53a3-98c0-93df7b157fd5', 'Lakshmi-Ganesh idols', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('a0c98bfd-c567-53a3-98c0-93df7b157fd5', 'Lotus flowers', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('a0c98bfd-c567-53a3-98c0-93df7b157fd5', 'Kamal gatta mala', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('a0c98bfd-c567-53a3-98c0-93df7b157fd5', 'Silver coin', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('a0c98bfd-c567-53a3-98c0-93df7b157fd5', 'Kheel-batasha', 4);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('a0c98bfd-c567-53a3-98c0-93df7b157fd5', 'Bahi khata & pen', 5);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('a0c98bfd-c567-53a3-98c0-93df7b157fd5', '11 diyas', 6);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('301053d0-abcb-5fe3-a4d3-f34f463d7eaf', 'Clay pot & soil', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('301053d0-abcb-5fe3-a4d3-f34f463d7eaf', 'Barley seeds (jawara)', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('301053d0-abcb-5fe3-a4d3-f34f463d7eaf', 'Kalash & coconut', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('301053d0-abcb-5fe3-a4d3-f34f463d7eaf', 'Red chunri', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('301053d0-abcb-5fe3-a4d3-f34f463d7eaf', 'Akhand jyoti diya', 4);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('301053d0-abcb-5fe3-a4d3-f34f463d7eaf', 'Nine-day flowers', 5);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('e2a08f68-0e01-5c2d-ab63-ebcc14dbbb03', 'Ganesh idol', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('e2a08f68-0e01-5c2d-ab63-ebcc14dbbb03', 'Durva & modak', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('e2a08f68-0e01-5c2d-ab63-ebcc14dbbb03', 'Red flowers', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('e2a08f68-0e01-5c2d-ab63-ebcc14dbbb03', 'Decoration set', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('e2a08f68-0e01-5c2d-ab63-ebcc14dbbb03', 'Kalash', 4);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('e2a08f68-0e01-5c2d-ab63-ebcc14dbbb03', 'Aarti thali', 5);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('64385023-a98b-52c8-a0cc-26531056bbaf', 'Cow dung cakes', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('64385023-a98b-52c8-a0cc-26531056bbaf', 'Wheat sheaves', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('64385023-a98b-52c8-a0cc-26531056bbaf', 'Gulal & haldi', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('64385023-a98b-52c8-a0cc-26531056bbaf', 'Coconut', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('64385023-a98b-52c8-a0cc-26531056bbaf', 'Kalava thread', 4);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('64385023-a98b-52c8-a0cc-26531056bbaf', 'Water pot', 5);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('56da7ba6-697d-532a-ae6f-e596255a733e', 'Bamboo soop & daura', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('56da7ba6-697d-532a-ae6f-e596255a733e', 'Thekua prasad', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('56da7ba6-697d-532a-ae6f-e596255a733e', 'Sugarcane', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('56da7ba6-697d-532a-ae6f-e596255a733e', 'Seasonal fruits', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('56da7ba6-697d-532a-ae6f-e596255a733e', 'Diya & agarbatti', 4);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('56da7ba6-697d-532a-ae6f-e596255a733e', 'Sindoor', 5);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('e17144c1-8f56-59b4-91c4-9a8e2e70872d', 'Chowki decoration', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('e17144c1-8f56-59b4-91c4-9a8e2e70872d', 'Devi idols/pictures', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('e17144c1-8f56-59b4-91c4-9a8e2e70872d', 'Akhand jyoti', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('e17144c1-8f56-59b4-91c4-9a8e2e70872d', 'Bhajan mandali setup', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('e17144c1-8f56-59b4-91c4-9a8e2e70872d', 'Prasad & bhandara', 4);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('e17144c1-8f56-59b4-91c4-9a8e2e70872d', 'Red chunri', 5);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('f14af272-f9fd-5ea4-9ff7-cda0374fdc80', 'Birth date, time & place', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('f14af272-f9fd-5ea4-9ff7-cda0374fdc80', 'Both kundalis (for milan)', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('f14af272-f9fd-5ea4-9ff7-cda0374fdc80', 'Notebook for remedies', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('c6029093-3a6f-5aa0-a38d-d88117ad378d', 'Ghee for diya', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('c6029093-3a6f-5aa0-a38d-d88117ad378d', 'Flowers & garland', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('c6029093-3a6f-5aa0-a38d-d88117ad378d', 'Prasad items', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('c6029093-3a6f-5aa0-a38d-d88117ad378d', 'Agarbatti & dhoop', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('d9b011e0-0cbf-5d0a-995e-9c30148e718b', 'Kush & til', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('d9b011e0-0cbf-5d0a-995e-9c30148e718b', 'Ganga jal', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('d9b011e0-0cbf-5d0a-995e-9c30148e718b', 'White cloth', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('d9b011e0-0cbf-5d0a-995e-9c30148e718b', 'Havan samagri', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('d9b011e0-0cbf-5d0a-995e-9c30148e718b', 'Pind daan items', 4);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('726b9c60-e3ba-50cd-a451-349aff410f01', 'Lakshmi-Ganesh idols', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('726b9c60-e3ba-50cd-a451-349aff410f01', 'Kalash & coconut', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('726b9c60-e3ba-50cd-a451-349aff410f01', 'Cash box & bahi khata', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('726b9c60-e3ba-50cd-a451-349aff410f01', 'Nimbu-mirchi & toran', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('726b9c60-e3ba-50cd-a451-349aff410f01', 'Havan samagri', 4);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('d4c0d2c2-9bdd-554f-ac1b-117da63fa953', 'Black til & mustard oil', 0);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('d4c0d2c2-9bdd-554f-ac1b-117da63fa953', 'Black cloth & urad dal', 1);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('d4c0d2c2-9bdd-554f-ac1b-117da63fa953', 'Iron item for daan', 2);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('d4c0d2c2-9bdd-554f-ac1b-117da63fa953', 'Blue flowers', 3);
INSERT INTO service_samagri (service_id, item_name, display_order) VALUES ('d4c0d2c2-9bdd-554f-ac1b-117da63fa953', 'Havan samagri', 4);

-- temples
INSERT INTO temples (
         id, name, slug, description, short_description, primary_deity, address_line1, city, state,
         latitude, longitude, cover_image_url, history, significance, avg_rating, review_count, pandit_count,
         is_verified, is_active
       ) VALUES (
         '8eaaf858-ccfb-5889-a84b-72c2889eceac', 'Kashi Vishwanath Temple', 'kashi-vishwanath', 'One of the twelve Jyotirlingas and the spiritual heart of Varanasi, standing on the western bank of the Ganga. The present structure was rebuilt by Maharani Ahilyabai Holkar in 1780. Rudrabhishek and Mahamrityunjay jaap here are considered especially potent.', 'One of the twelve Jyotirlingas and the spiritual heart of Varanasi, standing on the western bank of the Ganga. The present structure was rebuilt by Maharani Ahilyabai Holkar in 1780. Rudrabhishek and Mahamrityunjay jaap here are considered especially potent.',
         'Lord Shiva', 'Varanasi', 'Varanasi', 'Uttar Pradesh', 25.3109, 83.0107, '/assets/img/temples/kashi-vishwanath.jpg',
         'One of the twelve Jyotirlingas and the spiritual heart of Varanasi, standing on the western bank of the Ganga. The present structure was rebuilt by Maharani Ahilyabai Holkar in 1780. Rudrabhishek and Mahamrityunjay jaap here are considered especially potent.

Traditional timings: 3:00 AM – 11:00 PM
Established: 1780', 'Jyotirlinga darshan · Ganga Aarti at Dashashwamedh · Mangala Aarti (3 AM) · Annakut in Kartik',
         4.8, 1204, 12, TRUE, TRUE
       );
INSERT INTO temples (
         id, name, slug, description, short_description, primary_deity, address_line1, city, state,
         latitude, longitude, cover_image_url, history, significance, avg_rating, review_count, pandit_count,
         is_verified, is_active
       ) VALUES (
         '688beda2-fa0c-53a5-a9f5-36e53be41dfd', 'Mahakaleshwar Jyotirlinga', 'mahakaleshwar', 'The only south-facing Jyotirlinga, famous for the Bhasma Aarti performed at dawn with sacred ash. Ujjain is the traditional seat for Kaal Sarp and Mangal dosh nivaran pujas.', 'The only south-facing Jyotirlinga, famous for the Bhasma Aarti performed at dawn with sacred ash. Ujjain is the traditional seat for Kaal Sarp and Mangal dosh nivaran pujas.',
         'Lord Mahakal', 'Ujjain', 'Ujjain', 'Madhya Pradesh', 23.1828, 75.7683, '/assets/img/temples/mahakaleshwar.jpg',
         'The only south-facing Jyotirlinga, famous for the Bhasma Aarti performed at dawn with sacred ash. Ujjain is the traditional seat for Kaal Sarp and Mangal dosh nivaran pujas.

Traditional timings: 4:00 AM – 11:00 PM
Established: Ancient', 'Bhasma Aarti (4 AM) · Kaal Sarp dosh puja · Nagchandreshwar darshan · Simhastha Kumbh',
         4.9, 1876, 18, TRUE, TRUE
       );
INSERT INTO temples (
         id, name, slug, description, short_description, primary_deity, address_line1, city, state,
         latitude, longitude, cover_image_url, history, significance, avg_rating, review_count, pandit_count,
         is_verified, is_active
       ) VALUES (
         '97c4197b-3741-50c5-a0a7-8e3d8d357a90', 'Har Ki Pauri & Daksheshwar', 'har-ki-pauri', 'The principal ghat of Haridwar where the Ganga enters the plains. The traditional destination for Shradh, Tarpan, Mundan and Asthi visarjan, with generations of pandit families maintaining vanshavali records.', 'The principal ghat of Haridwar where the Ganga enters the plains. The traditional destination for Shradh, Tarpan, Mundan and Asthi visarjan, with generations of pandit families maintaining vanshavali records.',
         'Ganga Mata', 'Haridwar', 'Haridwar', 'Uttarakhand', 29.9457, 78.1642, '/assets/img/temples/har-ki-pauri.jpg',
         'The principal ghat of Haridwar where the Ganga enters the plains. The traditional destination for Shradh, Tarpan, Mundan and Asthi visarjan, with generations of pandit families maintaining vanshavali records.

Traditional timings: 5:00 AM – 10:00 PM
Established: 1810', 'Evening Ganga Aarti · Pind daan & tarpan · Vanshavali records · Kanwar Yatra season',
         4.7, 942, 22, TRUE, TRUE
       );
INSERT INTO temples (
         id, name, slug, description, short_description, primary_deity, address_line1, city, state,
         latitude, longitude, cover_image_url, history, significance, avg_rating, review_count, pandit_count,
         is_verified, is_active
       ) VALUES (
         'e26626f2-7638-514e-87e2-4dd3cf0161ec', 'Shri Banke Bihari Mandir', 'banke-bihari', 'The most beloved Krishna temple of Vrindavan, where the curtain is drawn every few minutes so devotees never meet Bihari ji''s gaze for too long. Bhagwat Katha and Chhappan Bhog seva are arranged through temple pandits.', 'The most beloved Krishna temple of Vrindavan, where the curtain is drawn every few minutes so devotees never meet Bihari ji''s gaze for too long. Bhagwat Katha and Chhappan Bhog seva are arranged through temple pandits.',
         'Lord Krishna', 'Mathura', 'Mathura', 'Uttar Pradesh', 27.5826, 77.7003, '/assets/img/temples/banke-bihari.jpg',
         'The most beloved Krishna temple of Vrindavan, where the curtain is drawn every few minutes so devotees never meet Bihari ji''s gaze for too long. Bhagwat Katha and Chhappan Bhog seva are arranged through temple pandits.

Traditional timings: 7:45 AM – 9:30 PM
Established: 1864', 'Jhulan & Holi utsav · Chhappan Bhog seva · Mangla Aarti (Janmashtami) · Bhagwat Katha vachak',
         4.8, 1338, 14, TRUE, TRUE
       );
INSERT INTO temples (
         id, name, slug, description, short_description, primary_deity, address_line1, city, state,
         latitude, longitude, cover_image_url, history, significance, avg_rating, review_count, pandit_count,
         is_verified, is_active
       ) VALUES (
         'eefad424-582d-5135-bdd5-40b44157fea3', 'Shri Ram Janmabhoomi Mandir', 'ram-mandir', 'The grand Nagara-style temple at Ram Janmabhoomi, consecrated in January 2024. Akhand Ramayan Path and Sunderkand recitals are the most requested sevas, along with Saryu snan rituals.', 'The grand Nagara-style temple at Ram Janmabhoomi, consecrated in January 2024. Akhand Ramayan Path and Sunderkand recitals are the most requested sevas, along with Saryu snan rituals.',
         'Lord Ram', 'Ayodhya', 'Ayodhya', 'Uttar Pradesh', 26.7956, 82.1943, '/assets/img/temples/ram-mandir.jpg',
         'The grand Nagara-style temple at Ram Janmabhoomi, consecrated in January 2024. Akhand Ramayan Path and Sunderkand recitals are the most requested sevas, along with Saryu snan rituals.

Traditional timings: 6:30 AM – 9:30 PM
Established: 2024', 'Ram Lalla darshan · Akhand Ramayan Path · Deepotsav (Diwali) · Saryu ghat rituals',
         4.9, 2410, 26, TRUE, TRUE
       );
INSERT INTO temples (
         id, name, slug, description, short_description, primary_deity, address_line1, city, state,
         latitude, longitude, cover_image_url, history, significance, avg_rating, review_count, pandit_count,
         is_verified, is_active
       ) VALUES (
         '75f34963-b5e1-5a70-9c5c-5429ecb7d41d', 'Tirumala Venkateswara Temple', 'tirumala', 'The world''s most-visited temple, on the seventh hill of Tirumala. Mundan (tonsure) and Annaprashan here are family traditions across South India; Kalyanotsavam is performed daily.', 'The world''s most-visited temple, on the seventh hill of Tirumala. Mundan (tonsure) and Annaprashan here are family traditions across South India; Kalyanotsavam is performed daily.',
         'Lord Venkateswara', 'Tirupati', 'Tirupati', 'Andhra Pradesh', 13.6833, 79.3474, '/assets/img/temples/tirumala.jpg',
         'The world''s most-visited temple, on the seventh hill of Tirumala. Mundan (tonsure) and Annaprashan here are family traditions across South India; Kalyanotsavam is performed daily.

Traditional timings: 2:30 AM – 1:30 AM
Established: 300 CE', 'Suprabhata Seva · Kalyanotsavam · Tonsure (mottai) ritual · Brahmotsavam',
         4.9, 3204, 20, TRUE, TRUE
       );
INSERT INTO temples (
         id, name, slug, description, short_description, primary_deity, address_line1, city, state,
         latitude, longitude, cover_image_url, history, significance, avg_rating, review_count, pandit_count,
         is_verified, is_active
       ) VALUES (
         '5e2e7e25-ac94-5986-b843-cacd23da3b56', 'Shri Jagannath Temple', 'jagannath-puri', 'Home of the Char Dham deity Jagannath with brother Balabhadra and sister Subhadra. Famous for the Rath Yatra and the Mahaprasad cooked in the world''s largest temple kitchen.', 'Home of the Char Dham deity Jagannath with brother Balabhadra and sister Subhadra. Famous for the Rath Yatra and the Mahaprasad cooked in the world''s largest temple kitchen.',
         'Lord Jagannath', 'Puri', 'Puri', 'Odisha', 19.805, 85.818, '/assets/img/temples/jagannath-puri.jpg',
         'Home of the Char Dham deity Jagannath with brother Balabhadra and sister Subhadra. Famous for the Rath Yatra and the Mahaprasad cooked in the world''s largest temple kitchen.

Traditional timings: 5:00 AM – 11:00 PM
Established: 12th c.', 'Rath Yatra · Mahaprasad seva · Snana Purnima · Pind daan at Swargadwar',
         4.8, 1654, 16, TRUE, TRUE
       );
INSERT INTO temples (
         id, name, slug, description, short_description, primary_deity, address_line1, city, state,
         latitude, longitude, cover_image_url, history, significance, avg_rating, review_count, pandit_count,
         is_verified, is_active
       ) VALUES (
         'a7dfbac7-c051-5c5b-8625-41948dd108eb', 'Meenakshi Amman Temple', 'meenakshi', 'A Dravidian masterpiece with fourteen towering gopurams and the Hall of Thousand Pillars. Thirukalyanam — the divine wedding — makes it a favoured venue for marriage rituals.', 'A Dravidian masterpiece with fourteen towering gopurams and the Hall of Thousand Pillars. Thirukalyanam — the divine wedding — makes it a favoured venue for marriage rituals.',
         'Goddess Meenakshi', 'Madurai', 'Madurai', 'Tamil Nadu', 9.9195, 78.1193, '/assets/img/temples/meenakshi.jpg',
         'A Dravidian masterpiece with fourteen towering gopurams and the Hall of Thousand Pillars. Thirukalyanam — the divine wedding — makes it a favoured venue for marriage rituals.

Traditional timings: 5:00 AM – 10:00 PM
Established: 17th c.', 'Thirukalyanam · Chithirai festival · Hall of 1000 Pillars · Night Palliarai seva',
         4.8, 1420, 15, TRUE, TRUE
       );
INSERT INTO temples (
         id, name, slug, description, short_description, primary_deity, address_line1, city, state,
         latitude, longitude, cover_image_url, history, significance, avg_rating, review_count, pandit_count,
         is_verified, is_active
       ) VALUES (
         'd0e9c36c-4f3b-568b-a3ca-5873b3d00e5f', 'Trimbakeshwar Shiva Temple', 'trimbakeshwar', 'A Jyotirlinga at the source of the Godavari and the recognised centre for Kaal Sarp Yog, Narayan Nagbali and Tripindi Shradh — pujas that require specially trained pandits.', 'A Jyotirlinga at the source of the Godavari and the recognised centre for Kaal Sarp Yog, Narayan Nagbali and Tripindi Shradh — pujas that require specially trained pandits.',
         'Lord Shiva', 'Nashik', 'Nashik', 'Maharashtra', 19.9333, 73.5297, '/assets/img/temples/trimbakeshwar.jpg',
         'A Jyotirlinga at the source of the Godavari and the recognised centre for Kaal Sarp Yog, Narayan Nagbali and Tripindi Shradh — pujas that require specially trained pandits.

Traditional timings: 5:30 AM – 9:00 PM
Established: 18th c.', 'Kaal Sarp Yog puja · Narayan Nagbali · Tripindi Shradh · Kushavarta Kund snan',
         4.7, 1108, 24, TRUE, TRUE
       );
INSERT INTO temples (
         id, name, slug, description, short_description, primary_deity, address_line1, city, state,
         latitude, longitude, cover_image_url, history, significance, avg_rating, review_count, pandit_count,
         is_verified, is_active
       ) VALUES (
         'afca3764-28ec-5a02-97be-c9a501b899d2', 'Dwarkadhish Temple', 'dwarkadhish', 'The Jagat Mandir of Char Dham fame, with a five-storey spire held by seventy-two pillars. Bhagwat Katha and Krishna-vivah style wedding rituals are performed by resident Gugli pandits.', 'The Jagat Mandir of Char Dham fame, with a five-storey spire held by seventy-two pillars. Bhagwat Katha and Krishna-vivah style wedding rituals are performed by resident Gugli pandits.',
         'Lord Krishna', 'Dwarka', 'Dwarka', 'Gujarat', 22.2378, 68.9685, '/assets/img/temples/dwarkadhish.jpg',
         'The Jagat Mandir of Char Dham fame, with a five-storey spire held by seventy-two pillars. Bhagwat Katha and Krishna-vivah style wedding rituals are performed by resident Gugli pandits.

Traditional timings: 6:00 AM – 9:30 PM
Established: 16th c.', 'Dhwaja changing seva · Janmashtami utsav · Gomti snan · Bet Dwarka darshan',
         4.7, 876, 11, TRUE, TRUE
       );
INSERT INTO temples (
         id, name, slug, description, short_description, primary_deity, address_line1, city, state,
         latitude, longitude, cover_image_url, history, significance, avg_rating, review_count, pandit_count,
         is_verified, is_active
       ) VALUES (
         '43c26630-a502-50cd-ba65-aa6587b8aa32', 'Kamakhya Devi Temple', 'kamakhya', 'The most revered Shakti Peeth on Nilachal Hill, centre of tantric worship. Durga Saptashati path and Devi anusthans here are conducted by hereditary tantric pandits.', 'The most revered Shakti Peeth on Nilachal Hill, centre of tantric worship. Durga Saptashati path and Devi anusthans here are conducted by hereditary tantric pandits.',
         'Goddess Kamakhya', 'Guwahati', 'Guwahati', 'Assam', 26.1664, 91.7055, '/assets/img/temples/kamakhya.jpg',
         'The most revered Shakti Peeth on Nilachal Hill, centre of tantric worship. Durga Saptashati path and Devi anusthans here are conducted by hereditary tantric pandits.

Traditional timings: 5:30 AM – 10:00 PM
Established: 8th c.', 'Ambubachi Mela · Durga Saptashati path · Panch Ratna darshan · Navratri anusthan',
         4.8, 1042, 13, TRUE, TRUE
       );
INSERT INTO temples (
         id, name, slug, description, short_description, primary_deity, address_line1, city, state,
         latitude, longitude, cover_image_url, history, significance, avg_rating, review_count, pandit_count,
         is_verified, is_active
       ) VALUES (
         'fffd6438-b32c-568b-89d1-b8007d923907', 'Shree Siddhivinayak Temple', 'siddhivinayak', 'Mumbai''s most visited Ganesh temple, where Tuesday queues stretch for kilometres. The first stop for Griha Pravesh sankalp and new-business pujas across the city.', 'Mumbai''s most visited Ganesh temple, where Tuesday queues stretch for kilometres. The first stop for Griha Pravesh sankalp and new-business pujas across the city.',
         'Lord Ganesh', 'Mumbai', 'Mumbai', 'Maharashtra', 19.017, 72.8302, '/assets/img/temples/siddhivinayak.jpg',
         'Mumbai''s most visited Ganesh temple, where Tuesday queues stretch for kilometres. The first stop for Griha Pravesh sankalp and new-business pujas across the city.

Traditional timings: 5:30 AM – 10:00 PM
Established: 1801', 'Tuesday Ganesh darshan · Ganesh Utsav (10 days) · Angarki Chaturthi · Kakad Aarti (5:30 AM)',
         4.8, 2140, 17, TRUE, TRUE
       );
INSERT INTO temples (
         id, name, slug, description, short_description, primary_deity, address_line1, city, state,
         latitude, longitude, cover_image_url, history, significance, avg_rating, review_count, pandit_count,
         is_verified, is_active
       ) VALUES (
         '058eb67e-4583-5362-a9dc-450f2b847bee', 'Shri Adya Katyayani Shakti Peeth', 'chhatarpur', 'Delhi''s sprawling Chhatarpur temple complex in white marble, packed through both Navratris. Jagran, Durga path and Mundan ceremonies are arranged in its many mandaps.', 'Delhi''s sprawling Chhatarpur temple complex in white marble, packed through both Navratris. Jagran, Durga path and Mundan ceremonies are arranged in its many mandaps.',
         'Goddess Katyayani', 'Delhi', 'Delhi', 'Delhi', 28.501, 77.178, '/assets/img/temples/chhatarpur.jpg',
         'Delhi''s sprawling Chhatarpur temple complex in white marble, packed through both Navratris. Jagran, Durga path and Mundan ceremonies are arranged in its many mandaps.

Traditional timings: 6:00 AM – 10:00 PM
Established: 1974', 'Navratri jagran · Marble mandap ceremonies · Shayan Aarti · Free bhandara',
         4.6, 728, 10, TRUE, TRUE
       );
INSERT INTO temples (
         id, name, slug, description, short_description, primary_deity, address_line1, city, state,
         latitude, longitude, cover_image_url, history, significance, avg_rating, review_count, pandit_count,
         is_verified, is_active
       ) VALUES (
         'eee43db2-e65f-5c78-9143-1c754f28d754', 'Govind Dev Ji Temple', 'govind-devji', 'Jaipur''s presiding deity inside the City Palace complex, with seven daily jhankis. Weddings and Bhagwat Katha here follow the Gaudiya Vaishnav tradition.', 'Jaipur''s presiding deity inside the City Palace complex, with seven daily jhankis. Weddings and Bhagwat Katha here follow the Gaudiya Vaishnav tradition.',
         'Lord Krishna', 'Jaipur', 'Jaipur', 'Rajasthan', 26.926, 75.8235, '/assets/img/temples/govind-devji.jpg',
         'Jaipur''s presiding deity inside the City Palace complex, with seven daily jhankis. Weddings and Bhagwat Katha here follow the Gaudiya Vaishnav tradition.

Traditional timings: 4:30 AM – 9:00 PM
Established: 1735', 'Seven daily jhankis · Janmashtami jhulan · Annakut darshan · Gaudiya vidhi weddings',
         4.7, 964, 12, TRUE, TRUE
       );

-- temple_services
INSERT INTO temple_services (temple_id, service_id) VALUES ('8eaaf858-ccfb-5889-a84b-72c2889eceac', '1c5de8aa-27a3-5aba-aa4b-6e86baf88b33');
INSERT INTO temple_services (temple_id, service_id) VALUES ('8eaaf858-ccfb-5889-a84b-72c2889eceac', 'a977f744-ac67-5fb3-8cfa-c62a377b9da2');
INSERT INTO temple_services (temple_id, service_id) VALUES ('8eaaf858-ccfb-5889-a84b-72c2889eceac', '9677e915-c2fd-58de-93a8-2aa81ac524af');
INSERT INTO temple_services (temple_id, service_id) VALUES ('8eaaf858-ccfb-5889-a84b-72c2889eceac', 'c6029093-3a6f-5aa0-a38d-d88117ad378d');
INSERT INTO temple_services (temple_id, service_id) VALUES ('8eaaf858-ccfb-5889-a84b-72c2889eceac', '9b2e0d02-a574-5016-838a-f26ae25849ac');
INSERT INTO temple_services (temple_id, service_id) VALUES ('688beda2-fa0c-53a5-a9f5-36e53be41dfd', '1c5de8aa-27a3-5aba-aa4b-6e86baf88b33');
INSERT INTO temple_services (temple_id, service_id) VALUES ('688beda2-fa0c-53a5-a9f5-36e53be41dfd', '742bcb1e-9f75-5ef0-b61a-00f76d8655ca');
INSERT INTO temple_services (temple_id, service_id) VALUES ('688beda2-fa0c-53a5-a9f5-36e53be41dfd', 'bbb8c252-9415-578a-aedb-59a584806ca6');
INSERT INTO temple_services (temple_id, service_id) VALUES ('688beda2-fa0c-53a5-a9f5-36e53be41dfd', 'a977f744-ac67-5fb3-8cfa-c62a377b9da2');
INSERT INTO temple_services (temple_id, service_id) VALUES ('688beda2-fa0c-53a5-a9f5-36e53be41dfd', '9677e915-c2fd-58de-93a8-2aa81ac524af');
INSERT INTO temple_services (temple_id, service_id) VALUES ('97c4197b-3741-50c5-a0a7-8e3d8d357a90', '9b2e0d02-a574-5016-838a-f26ae25849ac');
INSERT INTO temple_services (temple_id, service_id) VALUES ('97c4197b-3741-50c5-a0a7-8e3d8d357a90', 'b74daca0-9d20-568e-aea9-9036f6f907eb');
INSERT INTO temple_services (temple_id, service_id) VALUES ('97c4197b-3741-50c5-a0a7-8e3d8d357a90', '2b2ea34a-4a98-59b7-b6da-87507ccef7db');
INSERT INTO temple_services (temple_id, service_id) VALUES ('97c4197b-3741-50c5-a0a7-8e3d8d357a90', 'd9b011e0-0cbf-5d0a-995e-9c30148e718b');
INSERT INTO temple_services (temple_id, service_id) VALUES ('97c4197b-3741-50c5-a0a7-8e3d8d357a90', '9677e915-c2fd-58de-93a8-2aa81ac524af');
INSERT INTO temple_services (temple_id, service_id) VALUES ('e26626f2-7638-514e-87e2-4dd3cf0161ec', '550f458b-37ea-544a-b003-2b65d98d23f9');
INSERT INTO temple_services (temple_id, service_id) VALUES ('e26626f2-7638-514e-87e2-4dd3cf0161ec', '53bc7f66-eca7-5e6c-b2f0-90a46f2be45a');
INSERT INTO temple_services (temple_id, service_id) VALUES ('e26626f2-7638-514e-87e2-4dd3cf0161ec', '40092c7a-3739-51c2-a4be-06861f21b31d');
INSERT INTO temple_services (temple_id, service_id) VALUES ('e26626f2-7638-514e-87e2-4dd3cf0161ec', '9556a5f0-29d5-52e0-9e9b-8eeebb74bf3a');
INSERT INTO temple_services (temple_id, service_id) VALUES ('e26626f2-7638-514e-87e2-4dd3cf0161ec', '56b6a10e-594f-547c-8089-b018eda82497');
INSERT INTO temple_services (temple_id, service_id) VALUES ('eefad424-582d-5135-bdd5-40b44157fea3', '479c2055-e98f-52b6-bb70-eb1ab7e704e1');
INSERT INTO temple_services (temple_id, service_id) VALUES ('eefad424-582d-5135-bdd5-40b44157fea3', '30af3b0c-91ac-5cb0-8167-c853844a6cfd');
INSERT INTO temple_services (temple_id, service_id) VALUES ('eefad424-582d-5135-bdd5-40b44157fea3', '9677e915-c2fd-58de-93a8-2aa81ac524af');
INSERT INTO temple_services (temple_id, service_id) VALUES ('eefad424-582d-5135-bdd5-40b44157fea3', '40092c7a-3739-51c2-a4be-06861f21b31d');
INSERT INTO temple_services (temple_id, service_id) VALUES ('eefad424-582d-5135-bdd5-40b44157fea3', 'c6029093-3a6f-5aa0-a38d-d88117ad378d');
INSERT INTO temple_services (temple_id, service_id) VALUES ('75f34963-b5e1-5a70-9c5c-5429ecb7d41d', 'b74daca0-9d20-568e-aea9-9036f6f907eb');
INSERT INTO temple_services (temple_id, service_id) VALUES ('75f34963-b5e1-5a70-9c5c-5429ecb7d41d', '9556a5f0-29d5-52e0-9e9b-8eeebb74bf3a');
INSERT INTO temple_services (temple_id, service_id) VALUES ('75f34963-b5e1-5a70-9c5c-5429ecb7d41d', '40092c7a-3739-51c2-a4be-06861f21b31d');
INSERT INTO temple_services (temple_id, service_id) VALUES ('75f34963-b5e1-5a70-9c5c-5429ecb7d41d', 'c6029093-3a6f-5aa0-a38d-d88117ad378d');
INSERT INTO temple_services (temple_id, service_id) VALUES ('75f34963-b5e1-5a70-9c5c-5429ecb7d41d', '3333357a-4d3a-527b-b4e8-0dd61a5f5a9a');
INSERT INTO temple_services (temple_id, service_id) VALUES ('5e2e7e25-ac94-5986-b843-cacd23da3b56', '550f458b-37ea-544a-b003-2b65d98d23f9');
INSERT INTO temple_services (temple_id, service_id) VALUES ('5e2e7e25-ac94-5986-b843-cacd23da3b56', '9b2e0d02-a574-5016-838a-f26ae25849ac');
INSERT INTO temple_services (temple_id, service_id) VALUES ('5e2e7e25-ac94-5986-b843-cacd23da3b56', '9677e915-c2fd-58de-93a8-2aa81ac524af');
INSERT INTO temple_services (temple_id, service_id) VALUES ('5e2e7e25-ac94-5986-b843-cacd23da3b56', '53bc7f66-eca7-5e6c-b2f0-90a46f2be45a');
INSERT INTO temple_services (temple_id, service_id) VALUES ('5e2e7e25-ac94-5986-b843-cacd23da3b56', '56b6a10e-594f-547c-8089-b018eda82497');
INSERT INTO temple_services (temple_id, service_id) VALUES ('a7dfbac7-c051-5c5b-8625-41948dd108eb', '3333357a-4d3a-527b-b4e8-0dd61a5f5a9a');
INSERT INTO temple_services (temple_id, service_id) VALUES ('a7dfbac7-c051-5c5b-8625-41948dd108eb', '76ef4675-410c-51ec-aec9-a2635e9d7b2e');
INSERT INTO temple_services (temple_id, service_id) VALUES ('a7dfbac7-c051-5c5b-8625-41948dd108eb', '301053d0-abcb-5fe3-a4d3-f34f463d7eaf');
INSERT INTO temple_services (temple_id, service_id) VALUES ('a7dfbac7-c051-5c5b-8625-41948dd108eb', 'f14af272-f9fd-5ea4-9ff7-cda0374fdc80');
INSERT INTO temple_services (temple_id, service_id) VALUES ('a7dfbac7-c051-5c5b-8625-41948dd108eb', 'c6029093-3a6f-5aa0-a38d-d88117ad378d');
INSERT INTO temple_services (temple_id, service_id) VALUES ('d0e9c36c-4f3b-568b-a3ca-5873b3d00e5f', '742bcb1e-9f75-5ef0-b61a-00f76d8655ca');
INSERT INTO temple_services (temple_id, service_id) VALUES ('d0e9c36c-4f3b-568b-a3ca-5873b3d00e5f', '9b2e0d02-a574-5016-838a-f26ae25849ac');
INSERT INTO temple_services (temple_id, service_id) VALUES ('d0e9c36c-4f3b-568b-a3ca-5873b3d00e5f', 'bbb8c252-9415-578a-aedb-59a584806ca6');
INSERT INTO temple_services (temple_id, service_id) VALUES ('d0e9c36c-4f3b-568b-a3ca-5873b3d00e5f', '1c5de8aa-27a3-5aba-aa4b-6e86baf88b33');
INSERT INTO temple_services (temple_id, service_id) VALUES ('d0e9c36c-4f3b-568b-a3ca-5873b3d00e5f', 'd4c0d2c2-9bdd-554f-ac1b-117da63fa953');
INSERT INTO temple_services (temple_id, service_id) VALUES ('afca3764-28ec-5a02-97be-c9a501b899d2', '550f458b-37ea-544a-b003-2b65d98d23f9');
INSERT INTO temple_services (temple_id, service_id) VALUES ('afca3764-28ec-5a02-97be-c9a501b899d2', '3333357a-4d3a-527b-b4e8-0dd61a5f5a9a');
INSERT INTO temple_services (temple_id, service_id) VALUES ('afca3764-28ec-5a02-97be-c9a501b899d2', '53bc7f66-eca7-5e6c-b2f0-90a46f2be45a');
INSERT INTO temple_services (temple_id, service_id) VALUES ('afca3764-28ec-5a02-97be-c9a501b899d2', '40092c7a-3739-51c2-a4be-06861f21b31d');
INSERT INTO temple_services (temple_id, service_id) VALUES ('afca3764-28ec-5a02-97be-c9a501b899d2', 'c6029093-3a6f-5aa0-a38d-d88117ad378d');
INSERT INTO temple_services (temple_id, service_id) VALUES ('43c26630-a502-50cd-ba65-aa6587b8aa32', '76ef4675-410c-51ec-aec9-a2635e9d7b2e');
INSERT INTO temple_services (temple_id, service_id) VALUES ('43c26630-a502-50cd-ba65-aa6587b8aa32', '301053d0-abcb-5fe3-a4d3-f34f463d7eaf');
INSERT INTO temple_services (temple_id, service_id) VALUES ('43c26630-a502-50cd-ba65-aa6587b8aa32', 'e17144c1-8f56-59b4-91c4-9a8e2e70872d');
INSERT INTO temple_services (temple_id, service_id) VALUES ('43c26630-a502-50cd-ba65-aa6587b8aa32', 'bbb8c252-9415-578a-aedb-59a584806ca6');
INSERT INTO temple_services (temple_id, service_id) VALUES ('43c26630-a502-50cd-ba65-aa6587b8aa32', 'f14af272-f9fd-5ea4-9ff7-cda0374fdc80');
INSERT INTO temple_services (temple_id, service_id) VALUES ('fffd6438-b32c-568b-89d1-b8007d923907', '994d8b80-ceb7-55ac-830f-295e83466106');
INSERT INTO temple_services (temple_id, service_id) VALUES ('fffd6438-b32c-568b-89d1-b8007d923907', 'e2a08f68-0e01-5c2d-ab63-ebcc14dbbb03');
INSERT INTO temple_services (temple_id, service_id) VALUES ('fffd6438-b32c-568b-89d1-b8007d923907', '06a148ae-df90-5d9b-b5f4-768e9002c13b');
INSERT INTO temple_services (temple_id, service_id) VALUES ('fffd6438-b32c-568b-89d1-b8007d923907', '726b9c60-e3ba-50cd-a451-349aff410f01');
INSERT INTO temple_services (temple_id, service_id) VALUES ('fffd6438-b32c-568b-89d1-b8007d923907', '53bc7f66-eca7-5e6c-b2f0-90a46f2be45a');
INSERT INTO temple_services (temple_id, service_id) VALUES ('058eb67e-4583-5362-a9dc-450f2b847bee', '76ef4675-410c-51ec-aec9-a2635e9d7b2e');
INSERT INTO temple_services (temple_id, service_id) VALUES ('058eb67e-4583-5362-a9dc-450f2b847bee', '301053d0-abcb-5fe3-a4d3-f34f463d7eaf');
INSERT INTO temple_services (temple_id, service_id) VALUES ('058eb67e-4583-5362-a9dc-450f2b847bee', 'e17144c1-8f56-59b4-91c4-9a8e2e70872d');
INSERT INTO temple_services (temple_id, service_id) VALUES ('058eb67e-4583-5362-a9dc-450f2b847bee', 'b74daca0-9d20-568e-aea9-9036f6f907eb');
INSERT INTO temple_services (temple_id, service_id) VALUES ('058eb67e-4583-5362-a9dc-450f2b847bee', '06a148ae-df90-5d9b-b5f4-768e9002c13b');
INSERT INTO temple_services (temple_id, service_id) VALUES ('eee43db2-e65f-5c78-9143-1c754f28d754', '550f458b-37ea-544a-b003-2b65d98d23f9');
INSERT INTO temple_services (temple_id, service_id) VALUES ('eee43db2-e65f-5c78-9143-1c754f28d754', '53bc7f66-eca7-5e6c-b2f0-90a46f2be45a');
INSERT INTO temple_services (temple_id, service_id) VALUES ('eee43db2-e65f-5c78-9143-1c754f28d754', '3333357a-4d3a-527b-b4e8-0dd61a5f5a9a');
INSERT INTO temple_services (temple_id, service_id) VALUES ('eee43db2-e65f-5c78-9143-1c754f28d754', '9556a5f0-29d5-52e0-9e9b-8eeebb74bf3a');
INSERT INTO temple_services (temple_id, service_id) VALUES ('eee43db2-e65f-5c78-9143-1c754f28d754', 'c6029093-3a6f-5aa0-a38d-d88117ad378d');

-- one users row per pandit (synthetic account behind each demo profile)
INSERT INTO users (id, email, phone, password_hash, full_name, role, status, city, state, email_verified, phone_verified)
       VALUES ('6f368764-5196-5229-950a-f28975f52359', 'ramesh-sharma@panditconnect.demo', '+919000000101', '$2a$10$/rI1Tv/I8AqUANqddIo6t.SwzUjWLN/09RvLRmStBgoravFBun5ym', 'Pandit Ramesh Sharma', 'pandit', 'active', 'Varanasi', 'Uttar Pradesh', TRUE, TRUE);
INSERT INTO users (id, email, phone, password_hash, full_name, role, status, city, state, email_verified, phone_verified)
       VALUES ('9ebc917f-c73e-5015-9e82-5e5444d7460a', 'devdatt-shastri@panditconnect.demo', '+919000000102', '$2a$10$/rI1Tv/I8AqUANqddIo6t.SwzUjWLN/09RvLRmStBgoravFBun5ym', 'Pandit Devdatt Shastri', 'pandit', 'active', 'Ujjain', 'Madhya Pradesh', TRUE, TRUE);
INSERT INTO users (id, email, phone, password_hash, full_name, role, status, city, state, email_verified, phone_verified)
       VALUES ('f32f0e58-4ac5-5cc3-8a98-fdb9271dd8e4', 'naman-tiwari@panditconnect.demo', '+919000000103', '$2a$10$/rI1Tv/I8AqUANqddIo6t.SwzUjWLN/09RvLRmStBgoravFBun5ym', 'Pandit Naman Tiwari', 'pandit', 'active', 'Ayodhya', 'Uttar Pradesh', TRUE, TRUE);
INSERT INTO users (id, email, phone, password_hash, full_name, role, status, city, state, email_verified, phone_verified)
       VALUES ('b14e99ab-cfe4-511b-906c-8441b1db1d10', 'suresh-joshi@panditconnect.demo', '+919000000104', '$2a$10$/rI1Tv/I8AqUANqddIo6t.SwzUjWLN/09RvLRmStBgoravFBun5ym', 'Pandit Suresh Joshi', 'pandit', 'active', 'Nashik', 'Maharashtra', TRUE, TRUE);
INSERT INTO users (id, email, phone, password_hash, full_name, role, status, city, state, email_verified, phone_verified)
       VALUES ('2bad6cb7-17f8-544e-b395-b446dd63084f', 'anand-iyer@panditconnect.demo', '+919000000105', '$2a$10$/rI1Tv/I8AqUANqddIo6t.SwzUjWLN/09RvLRmStBgoravFBun5ym', 'Pandit Anand Iyer', 'pandit', 'active', 'Madurai', 'Tamil Nadu', TRUE, TRUE);
INSERT INTO users (id, email, phone, password_hash, full_name, role, status, city, state, email_verified, phone_verified)
       VALUES ('6d4b3e58-3cf0-5a71-b1f9-db26451c18e1', 'mohan-das@panditconnect.demo', '+919000000106', '$2a$10$/rI1Tv/I8AqUANqddIo6t.SwzUjWLN/09RvLRmStBgoravFBun5ym', 'Pandit Mohan Das', 'pandit', 'active', 'Puri', 'Odisha', TRUE, TRUE);
INSERT INTO users (id, email, phone, password_hash, full_name, role, status, city, state, email_verified, phone_verified)
       VALUES ('b823c9bf-3e64-524b-8eb7-6c6223ccf2e1', 'gopal-chaturvedi@panditconnect.demo', '+919000000107', '$2a$10$/rI1Tv/I8AqUANqddIo6t.SwzUjWLN/09RvLRmStBgoravFBun5ym', 'Pandit Gopal Chaturvedi', 'pandit', 'active', 'Mathura', 'Uttar Pradesh', TRUE, TRUE);
INSERT INTO users (id, email, phone, password_hash, full_name, role, status, city, state, email_verified, phone_verified)
       VALUES ('4daac5a1-7289-54b9-87ec-bf34c47a7e8f', 'vikas-upadhyay@panditconnect.demo', '+919000000108', '$2a$10$/rI1Tv/I8AqUANqddIo6t.SwzUjWLN/09RvLRmStBgoravFBun5ym', 'Pandit Vikas Upadhyay', 'pandit', 'active', 'Haridwar', 'Uttarakhand', TRUE, TRUE);
INSERT INTO users (id, email, phone, password_hash, full_name, role, status, city, state, email_verified, phone_verified)
       VALUES ('1a1b5c30-d058-54f1-906a-b6f42f7168f0', 'srinivas-rao@panditconnect.demo', '+919000000109', '$2a$10$/rI1Tv/I8AqUANqddIo6t.SwzUjWLN/09RvLRmStBgoravFBun5ym', 'Pandit Srinivas Rao', 'pandit', 'active', 'Tirupati', 'Andhra Pradesh', TRUE, TRUE);
INSERT INTO users (id, email, phone, password_hash, full_name, role, status, city, state, email_verified, phone_verified)
       VALUES ('974101b2-e19a-51a9-b7dc-e38e38b75ae4', 'harish-bhatt@panditconnect.demo', '+919000000110', '$2a$10$/rI1Tv/I8AqUANqddIo6t.SwzUjWLN/09RvLRmStBgoravFBun5ym', 'Pandit Harish Bhatt', 'pandit', 'active', 'Dwarka', 'Gujarat', TRUE, TRUE);
INSERT INTO users (id, email, phone, password_hash, full_name, role, status, city, state, email_verified, phone_verified)
       VALUES ('46cf5baf-0d7a-57d9-8622-c28ac3186844', 'bipul-goswami@panditconnect.demo', '+919000000111', '$2a$10$/rI1Tv/I8AqUANqddIo6t.SwzUjWLN/09RvLRmStBgoravFBun5ym', 'Pandit Bipul Goswami', 'pandit', 'active', 'Guwahati', 'Assam', TRUE, TRUE);
INSERT INTO users (id, email, phone, password_hash, full_name, role, status, city, state, email_verified, phone_verified)
       VALUES ('fdbbbef3-9801-5721-aae1-f9abf205f121', 'kailash-mishra@panditconnect.demo', '+919000000112', '$2a$10$/rI1Tv/I8AqUANqddIo6t.SwzUjWLN/09RvLRmStBgoravFBun5ym', 'Pandit Kailash Mishra', 'pandit', 'active', 'Mumbai', 'Maharashtra', TRUE, TRUE);
INSERT INTO users (id, email, phone, password_hash, full_name, role, status, city, state, email_verified, phone_verified)
       VALUES ('42b337c2-bed4-57cb-ba73-a3851a0a6c68', 'satish-dubey@panditconnect.demo', '+919000000113', '$2a$10$/rI1Tv/I8AqUANqddIo6t.SwzUjWLN/09RvLRmStBgoravFBun5ym', 'Pandit Satish Dubey', 'pandit', 'active', 'Delhi', 'Delhi', TRUE, TRUE);
INSERT INTO users (id, email, phone, password_hash, full_name, role, status, city, state, email_verified, phone_verified)
       VALUES ('2eea2e0d-cf9d-5ca1-a9ce-19f0e76f58dc', 'mahesh-vyas@panditconnect.demo', '+919000000114', '$2a$10$/rI1Tv/I8AqUANqddIo6t.SwzUjWLN/09RvLRmStBgoravFBun5ym', 'Pandit Mahesh Vyas', 'pandit', 'active', 'Jaipur', 'Rajasthan', TRUE, TRUE);
INSERT INTO users (id, email, phone, password_hash, full_name, role, status, city, state, email_verified, phone_verified)
       VALUES ('90c58aa6-0e82-5555-b485-dc054470a16f', 'raghav-pathak@panditconnect.demo', '+919000000115', '$2a$10$/rI1Tv/I8AqUANqddIo6t.SwzUjWLN/09RvLRmStBgoravFBun5ym', 'Pandit Raghav Pathak', 'pandit', 'active', 'Varanasi', 'Uttar Pradesh', TRUE, TRUE);
INSERT INTO users (id, email, phone, password_hash, full_name, role, status, city, state, email_verified, phone_verified)
       VALUES ('95682d13-84b5-5dbb-b498-a96e4df5456a', 'lakshman-acharya@panditconnect.demo', '+919000000116', '$2a$10$/rI1Tv/I8AqUANqddIo6t.SwzUjWLN/09RvLRmStBgoravFBun5ym', 'Pandit Lakshman Acharya', 'pandit', 'active', 'Ujjain', 'Madhya Pradesh', TRUE, TRUE);

-- pandits
INSERT INTO pandits (
         id, user_id, bio, short_bio, experience_years, specializations, public_phone, whatsapp_number,
         profile_photo_url, verification_status, review_count, avg_rating, current_tier, slug, is_available
       ) VALUES (
         '31ed3761-5a33-518c-8ea6-d9186ce7fc4d', '6f368764-5196-5229-950a-f28975f52359', 'Twenty-two years of performing Rudrabhishek and Mahamrityunjay anusthans at Kashi Vishwanath. Explains every step of the vidhi in Hindi and English so families understand what they are participating in.

Gotra: Bharadwaj | Education: Shastri (Veda), Sampurnanand Sanskrit University', 'Twenty-two years of performing Rudrabhishek and Mahamrityunjay anusthans at Kashi Vishwanath. Explains every step of the vidhi in Hindi and English so families understand what they are participating in.',
         22, ARRAY['Rudrabhishek', 'Mahamrityunjay Jaap', 'Havan / Yagna', 'Griha Pravesh', 'Wedding Ceremony'], '+919000000101', '+919000000101', '/assets/img/pandits/ramesh-sharma.jpg',
         'verified', 186, 4.9, 'diamond', 'ramesh-sharma', TRUE
       );
INSERT INTO pandits (
         id, user_id, bio, short_bio, experience_years, specializations, public_phone, whatsapp_number,
         profile_photo_url, verification_status, review_count, avg_rating, current_tier, slug, is_available
       ) VALUES (
         'e418106d-e5bb-5ffa-8593-4186247fd003', '9ebc917f-c73e-5015-9e82-5e5444d7460a', 'Ujjain''s senior-most Kaal Sarp and Navgrah shanti specialist. Reads the kundali first and performs only the puja your chart actually calls for — never a package.

Gotra: Kashyap | Education: Acharya (Jyotish), Maharishi Panini Sanskrit University', 'Ujjain''s senior-most Kaal Sarp and Navgrah shanti specialist. Reads the kundali first and performs only the puja your chart actually calls for — never a package.',
         28, ARRAY['Kaal Sarp Dosh Puja', 'Navgraha Shanti', 'Rudrabhishek', 'Shani Shanti Puja', 'Mahamrityunjay Jaap'], '+919000000102', '+919000000102', '/assets/img/pandits/devdatt-shastri.jpg',
         'verified', 241, 4.9, 'diamond', 'devdatt-shastri', TRUE
       );
INSERT INTO pandits (
         id, user_id, bio, short_bio, experience_years, specializations, public_phone, whatsapp_number,
         profile_photo_url, verification_status, review_count, avg_rating, current_tier, slug, is_available
       ) VALUES (
         '10f3f087-fc02-590a-b797-a1b4460f14ef', 'f32f0e58-4ac5-5cc3-8a98-fdb9271dd8e4', 'Leads a Sunderkand mandali of five with dholak and manjira. Known for a clear, singing recitation style that keeps children and elders engaged for the full three hours.

Gotra: Vatsa | Education: Shastri (Ramcharitmanas), Ayodhya Sanskrit Mahavidyalaya', 'Leads a Sunderkand mandali of five with dholak and manjira. Known for a clear, singing recitation style that keeps children and elders engaged for the full three hours.',
         14, ARRAY['Sunderkand Path', 'Akhand Ramayan Path', 'Havan / Yagna', 'Namkaran Sanskar', 'Satyanarayan Katha', 'Chhath Puja Vidhi'], '+919000000103', '+919000000103', '/assets/img/pandits/naman-tiwari.jpg',
         'verified', 132, 4.8, 'gold', 'naman-tiwari', TRUE
       );
INSERT INTO pandits (
         id, user_id, bio, short_bio, experience_years, specializations, public_phone, whatsapp_number,
         profile_photo_url, verification_status, review_count, avg_rating, current_tier, slug, is_available
       ) VALUES (
         'a08063d0-8621-596b-8ea4-baa45e073063', 'b14e99ab-cfe4-511b-906c-8441b1db1d10', 'Trained at Trimbakeshwar Vedshala in Narayan Nagbali and Tripindi Shradh — rituals that require exact procedure. Handles all samagri arrangement at the ghat himself.

Gotra: Gautam | Education: Ved Murti, Trimbakeshwar Vedshala', 'Trained at Trimbakeshwar Vedshala in Narayan Nagbali and Tripindi Shradh — rituals that require exact procedure. Handles all samagri arrangement at the ghat himself.',
         19, ARRAY['Kaal Sarp Dosh Puja', 'Pitru Dosh / Shradh', 'Navgraha Shanti', 'Vastu Shanti', 'Shani Shanti Puja'], '+919000000104', '+919000000104', '/assets/img/pandits/suresh-joshi.jpg',
         'verified', 164, 4.8, 'gold', 'suresh-joshi', TRUE
       );
INSERT INTO pandits (
         id, user_id, bio, short_bio, experience_years, specializations, public_phone, whatsapp_number,
         profile_photo_url, verification_status, review_count, avg_rating, current_tier, slug, is_available
       ) VALUES (
         '74812001-07ef-5876-ac6f-6e2cf186886d', '2bad6cb7-17f8-544e-b395-b446dd63084f', 'A Ghanapaathi who has conducted over 900 Tamil-tradition weddings at Meenakshi Amman. Provides the full muhurat sheet and guna-milan report before the ceremony.

Gotra: Srivatsa | Education: Ghanapaathi (Yajur Veda), Madurai Veda Patasala', 'A Ghanapaathi who has conducted over 900 Tamil-tradition weddings at Meenakshi Amman. Provides the full muhurat sheet and guna-milan report before the ceremony.',
         24, ARRAY['Wedding Ceremony', 'Namkaran Sanskar', 'Annaprashan', 'Durga Saptashati Path', 'Kundali & Matchmaking'], '+919000000105', '+919000000105', '/assets/img/pandits/anand-iyer.jpg',
         'verified', 208, 4.9, 'diamond', 'anand-iyer', TRUE
       );
INSERT INTO pandits (
         id, user_id, bio, short_bio, experience_years, specializations, public_phone, whatsapp_number,
         profile_photo_url, verification_status, review_count, avg_rating, current_tier, slug, is_available
       ) VALUES (
         '364cd69f-bf8b-5b27-9c78-e93d10b7dfcd', '6d4b3e58-3cf0-5a71-b1f9-db26451c18e1', 'Sevayat family of the Jagannath temple, fourth generation. Conducts Pind daan at Swargadwar and seven-day Bhagwat Katha in Odia, Hindi or Bengali.

Gotra: Vishwamitra | Education: Shastri (Puran), Puri Sanskrit College', 'Sevayat family of the Jagannath temple, fourth generation. Conducts Pind daan at Swargadwar and seven-day Bhagwat Katha in Odia, Hindi or Bengali.',
         17, ARRAY['Pitru Dosh / Shradh', 'Bhagwat Katha', 'Havan / Yagna', 'Gau Puja & Daan', 'Satyanarayan Katha'], '+919000000106', '+919000000106', '/assets/img/pandits/mohan-das.jpg',
         'verified', 118, 4.7, 'silver', 'mohan-das', TRUE
       );
INSERT INTO pandits (
         id, user_id, bio, short_bio, experience_years, specializations, public_phone, whatsapp_number,
         profile_photo_url, verification_status, review_count, avg_rating, current_tier, slug, is_available
       ) VALUES (
         '78e7167f-c063-58ac-a090-4828679a2789', 'b823c9bf-3e64-524b-8eb7-6c6223ccf2e1', 'Braj-tradition katha vachak. His seven-day Bhagwat Katha includes daily bhajan and a Chhappan Bhog on the final day, arranged with the temple kitchen.

Gotra: Garg | Education: Acharya (Bhagwat), Vrindavan Shodh Sansthan', 'Braj-tradition katha vachak. His seven-day Bhagwat Katha includes daily bhajan and a Chhappan Bhog on the final day, arranged with the temple kitchen.',
         21, ARRAY['Bhagwat Katha', 'Satyanarayan Katha', 'Ganesh Puja', 'Annaprashan', 'Gau Puja & Daan'], '+919000000107', '+919000000107', '/assets/img/pandits/gopal-chaturvedi.jpg',
         'verified', 176, 4.8, 'gold', 'gopal-chaturvedi', TRUE
       );
INSERT INTO pandits (
         id, user_id, bio, short_bio, experience_years, specializations, public_phone, whatsapp_number,
         profile_photo_url, verification_status, review_count, avg_rating, current_tier, slug, is_available
       ) VALUES (
         '7f13ecb0-64f8-5177-b6b9-759e93d23799', '4daac5a1-7289-54b9-87ec-bf34c47a7e8f', 'Handles Mundan, Janeu and Shradh at Har Ki Pauri with the family vanshavali register. Patient with first-time families and transparent about ghat charges upfront.

Gotra: Bhargav | Education: Shastri (Karmakand), Gurukul Kangri', 'Handles Mundan, Janeu and Shradh at Har Ki Pauri with the family vanshavali register. Patient with first-time families and transparent about ghat charges upfront.',
         12, ARRAY['Mundan Ceremony', 'Janeu / Upanayan', 'Pitru Dosh / Shradh', 'Antim Sanskar', 'Havan / Yagna'], '+919000000108', '+919000000108', '/assets/img/pandits/vikas-upadhyay.jpg',
         'verified', 96, 4.7, 'silver', 'vikas-upadhyay', TRUE
       );
INSERT INTO pandits (
         id, user_id, bio, short_bio, experience_years, specializations, public_phone, whatsapp_number,
         profile_photo_url, verification_status, review_count, avg_rating, current_tier, slug, is_available
       ) VALUES (
         '864b0d69-fb7d-5344-afcc-cf42d4910f39', '1a1b5c30-d058-54f1-906a-b6f42f7168f0', 'Twenty-six years of Tirumala sevas. Coordinates tonsure, Annaprashan and Kalyanotsavam slots including the TTD booking formalities for out-of-state families.

Gotra: Atreya | Education: Vedanta Vidwan, Tirumala Veda Patasala', 'Twenty-six years of Tirumala sevas. Coordinates tonsure, Annaprashan and Kalyanotsavam slots including the TTD booking formalities for out-of-state families.',
         26, ARRAY['Mundan Ceremony', 'Annaprashan', 'Namkaran Sanskar', 'Wedding Ceremony', 'Kundali & Matchmaking'], '+919000000109', '+919000000109', '/assets/img/pandits/srinivas-rao.jpg',
         'verified', 224, 4.9, 'diamond', 'srinivas-rao', TRUE
       );
INSERT INTO pandits (
         id, user_id, bio, short_bio, experience_years, specializations, public_phone, whatsapp_number,
         profile_photo_url, verification_status, review_count, avg_rating, current_tier, slug, is_available
       ) VALUES (
         '5addaad2-e05a-5dd0-90a5-4739d9d6bcd4', '974101b2-e19a-51a9-b7dc-e38e38b75ae4', 'Gugli pandit of Dwarkadhish. Performs Gujarati-vidhi weddings and Griha Pravesh with the complete samagri list shared on WhatsApp a week in advance.

Gotra: Shandilya | Education: Shastri (Veda), Dwarka Sharda Peeth', 'Gugli pandit of Dwarkadhish. Performs Gujarati-vidhi weddings and Griha Pravesh with the complete samagri list shared on WhatsApp a week in advance.',
         16, ARRAY['Bhagwat Katha', 'Wedding Ceremony', 'Griha Pravesh', 'Shop / Office Opening', 'Satyanarayan Katha'], '+919000000110', '+919000000110', '/assets/img/pandits/harish-bhatt.jpg',
         'verified', 104, 4.7, 'silver', 'harish-bhatt', TRUE
       );
INSERT INTO pandits (
         id, user_id, bio, short_bio, experience_years, specializations, public_phone, whatsapp_number,
         profile_photo_url, verification_status, review_count, avg_rating, current_tier, slug, is_available
       ) VALUES (
         '41e8fc01-72ea-5800-8a18-a578be661d4d', '46cf5baf-0d7a-57d9-8622-c28ac3186844', 'Hereditary Kamakhya pandit for Devi anusthans. Performs the complete Durga Saptashati with Kavach-Argala-Keelak and explains each remedy in plain language.

Gotra: Kaushik | Education: Tantra Acharya, Kamakhya Peeth', 'Hereditary Kamakhya pandit for Devi anusthans. Performs the complete Durga Saptashati with Kavach-Argala-Keelak and explains each remedy in plain language.',
         15, ARRAY['Durga Saptashati Path', 'Navratri Kalash Sthapana', 'Mata Ka Jagran', 'Navgraha Shanti', 'Kundali & Matchmaking'], '+919000000111', '+919000000111', '/assets/img/pandits/bipul-goswami.jpg',
         'verified', 112, 4.8, 'gold', 'bipul-goswami', TRUE
       );
INSERT INTO pandits (
         id, user_id, bio, short_bio, experience_years, specializations, public_phone, whatsapp_number,
         profile_photo_url, verification_status, review_count, avg_rating, current_tier, slug, is_available
       ) VALUES (
         'e86e45ca-0967-5800-b8ba-35a304cc1e61', 'fdbbbef3-9801-5721-aae1-f9abf205f121', 'Mumbai''s go-to pandit for flat Griha Pravesh and office openings. Works around apartment society rules and finishes within the muhurat window without rushing the vidhi.

Gotra: Vashishtha | Education: Ved Shastri, Mumbai Ved Vidyalaya', 'Mumbai''s go-to pandit for flat Griha Pravesh and office openings. Works around apartment society rules and finishes within the muhurat window without rushing the vidhi.',
         20, ARRAY['Ganesh Puja', 'Ganesh Utsav Sthapana', 'Griha Pravesh', 'Shop / Office Opening', 'Bhoomi Pujan'], '+919000000112', '+919000000112', '/assets/img/pandits/kailash-mishra.jpg',
         'verified', 198, 4.8, 'gold', 'kailash-mishra', TRUE
       );
INSERT INTO pandits (
         id, user_id, bio, short_bio, experience_years, specializations, public_phone, whatsapp_number,
         profile_photo_url, verification_status, review_count, avg_rating, current_tier, slug, is_available
       ) VALUES (
         '5c519924-358e-51fb-8291-28bb2d948c8e', '42b337c2-bed4-57cb-ba73-a3851a0a6c68', 'Delhi-NCR Griha Pravesh and Jagran specialist with his own bhajan mandali. Sends a printed vidhi card so the family knows the sequence in advance.

Gotra: Parashar | Education: Shastri (Karmakand), Delhi Sanskrit Academy', 'Delhi-NCR Griha Pravesh and Jagran specialist with his own bhajan mandali. Sends a printed vidhi card so the family knows the sequence in advance.',
         18, ARRAY['Griha Pravesh', 'Durga Saptashati Path', 'Mata Ka Jagran', 'Mundan Ceremony', 'Lakshmi Puja (Diwali)', 'Holika Dahan Puja'], '+919000000113', '+919000000113', '/assets/img/pandits/satish-dubey.jpg',
         'verified', 154, 4.7, 'gold', 'satish-dubey', TRUE
       );
INSERT INTO pandits (
         id, user_id, bio, short_bio, experience_years, specializations, public_phone, whatsapp_number,
         profile_photo_url, verification_status, review_count, avg_rating, current_tier, slug, is_available
       ) VALUES (
         '52b8ccb2-1405-5afe-bb91-f624feb31ec1', '2eea2e0d-cf9d-5ca1-a9ce-19f0e76f58dc', 'Marwari-tradition wedding vidhi with full jyotish backing — kundali milan, muhurat and dosh remedies handled by the same person who performs the ceremony.

Gotra: Dadhich | Education: Acharya (Jyotish), Jagatguru Ramanandacharya University', 'Marwari-tradition wedding vidhi with full jyotish backing — kundali milan, muhurat and dosh remedies handled by the same person who performs the ceremony.',
         23, ARRAY['Wedding Ceremony', 'Kundali & Matchmaking', 'Bhagwat Katha', 'Annaprashan', 'Navgraha Shanti'], '+919000000114', '+919000000114', '/assets/img/pandits/mahesh-vyas.jpg',
         'verified', 182, 4.8, 'diamond', 'mahesh-vyas', TRUE
       );
INSERT INTO pandits (
         id, user_id, bio, short_bio, experience_years, specializations, public_phone, whatsapp_number,
         profile_photo_url, verification_status, review_count, avg_rating, current_tier, slug, is_available
       ) VALUES (
         '00c04647-d82b-5b78-bafb-b7a0da1e7bb1', '90c58aa6-0e82-5555-b485-dc054470a16f', 'Younger BHU-trained pandit who runs online Sunderkand and Satyanarayan katha for families abroad, with the samagri list couriered in advance.

Gotra: Upamanyu | Education: Shastri (Veda), BHU', 'Younger BHU-trained pandit who runs online Sunderkand and Satyanarayan katha for families abroad, with the samagri list couriered in advance.',
         9, ARRAY['Sunderkand Path', 'Ganesh Puja', 'Satyanarayan Katha', 'Namkaran Sanskar', 'Daily Aarti Seva'], '+919000000115', '+919000000115', '/assets/img/pandits/raghav-pathak.jpg',
         'verified', 74, 4.6, 'silver', 'raghav-pathak', TRUE
       );
INSERT INTO pandits (
         id, user_id, bio, short_bio, experience_years, specializations, public_phone, whatsapp_number,
         profile_photo_url, verification_status, review_count, avg_rating, current_tier, slug, is_available
       ) VALUES (
         '520d0d5c-5e32-555b-8bf9-094bd941747f', '95682d13-84b5-5dbb-b498-a96e4df5456a', 'Thirty-one years at Mahakal. Conducts large-scale Mahamrityunjay jaap anusthans (1.25 lakh) with a team of eleven pandits and full sankalp documentation.

Gotra: Angiras | Education: Mahamahopadhyaya (Veda), Ujjain', 'Thirty-one years at Mahakal. Conducts large-scale Mahamrityunjay jaap anusthans (1.25 lakh) with a team of eleven pandits and full sankalp documentation.',
         31, ARRAY['Mahamrityunjay Jaap', 'Durga Saptashati Path', 'Havan / Yagna', 'Pitru Dosh / Shradh', 'Rudrabhishek'], '+919000000116', '+919000000116', '/assets/img/pandits/lakshman-acharya.jpg',
         'verified', 268, 4.9, 'diamond', 'lakshman-acharya', TRUE
       );

-- pandit_languages / pandit_services / pandit_temples / pandit_certificates
INSERT INTO pandit_languages (pandit_id, language) VALUES ('31ed3761-5a33-518c-8ea6-d9186ce7fc4d', 'Hindi');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('31ed3761-5a33-518c-8ea6-d9186ce7fc4d', 'Sanskrit');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('31ed3761-5a33-518c-8ea6-d9186ce7fc4d', 'English');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('31ed3761-5a33-518c-8ea6-d9186ce7fc4d', '1c5de8aa-27a3-5aba-aa4b-6e86baf88b33');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('31ed3761-5a33-518c-8ea6-d9186ce7fc4d', 'a977f744-ac67-5fb3-8cfa-c62a377b9da2');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('31ed3761-5a33-518c-8ea6-d9186ce7fc4d', '9677e915-c2fd-58de-93a8-2aa81ac524af');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('31ed3761-5a33-518c-8ea6-d9186ce7fc4d', '06a148ae-df90-5d9b-b5f4-768e9002c13b');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('31ed3761-5a33-518c-8ea6-d9186ce7fc4d', '3333357a-4d3a-527b-b4e8-0dd61a5f5a9a');
INSERT INTO pandit_temples (pandit_id, temple_id, is_primary) VALUES ('31ed3761-5a33-518c-8ea6-d9186ce7fc4d', '8eaaf858-ccfb-5889-a84b-72c2889eceac', TRUE);
INSERT INTO pandit_temples (pandit_id, temple_id, is_primary) VALUES ('31ed3761-5a33-518c-8ea6-d9186ce7fc4d', '97c4197b-3741-50c5-a0a7-8e3d8d357a90', FALSE);
INSERT INTO pandit_certificates (pandit_id, certificate_name, is_verified) VALUES ('31ed3761-5a33-518c-8ea6-d9186ce7fc4d', 'Shastri (Veda), Sampurnanand Sanskrit University', TRUE);
INSERT INTO pandit_languages (pandit_id, language) VALUES ('e418106d-e5bb-5ffa-8593-4186247fd003', 'Hindi');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('e418106d-e5bb-5ffa-8593-4186247fd003', 'Sanskrit');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('e418106d-e5bb-5ffa-8593-4186247fd003', 'Marathi');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('e418106d-e5bb-5ffa-8593-4186247fd003', '742bcb1e-9f75-5ef0-b61a-00f76d8655ca');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('e418106d-e5bb-5ffa-8593-4186247fd003', 'bbb8c252-9415-578a-aedb-59a584806ca6');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('e418106d-e5bb-5ffa-8593-4186247fd003', '1c5de8aa-27a3-5aba-aa4b-6e86baf88b33');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('e418106d-e5bb-5ffa-8593-4186247fd003', 'd4c0d2c2-9bdd-554f-ac1b-117da63fa953');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('e418106d-e5bb-5ffa-8593-4186247fd003', 'a977f744-ac67-5fb3-8cfa-c62a377b9da2');
INSERT INTO pandit_temples (pandit_id, temple_id, is_primary) VALUES ('e418106d-e5bb-5ffa-8593-4186247fd003', '688beda2-fa0c-53a5-a9f5-36e53be41dfd', TRUE);
INSERT INTO pandit_temples (pandit_id, temple_id, is_primary) VALUES ('e418106d-e5bb-5ffa-8593-4186247fd003', 'd0e9c36c-4f3b-568b-a3ca-5873b3d00e5f', FALSE);
INSERT INTO pandit_certificates (pandit_id, certificate_name, is_verified) VALUES ('e418106d-e5bb-5ffa-8593-4186247fd003', 'Acharya (Jyotish), Maharishi Panini Sanskrit University', TRUE);
INSERT INTO pandit_languages (pandit_id, language) VALUES ('10f3f087-fc02-590a-b797-a1b4460f14ef', 'Hindi');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('10f3f087-fc02-590a-b797-a1b4460f14ef', 'English');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('10f3f087-fc02-590a-b797-a1b4460f14ef', 'Bhojpuri');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('10f3f087-fc02-590a-b797-a1b4460f14ef', '30af3b0c-91ac-5cb0-8167-c853844a6cfd');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('10f3f087-fc02-590a-b797-a1b4460f14ef', '479c2055-e98f-52b6-bb70-eb1ab7e704e1');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('10f3f087-fc02-590a-b797-a1b4460f14ef', '9677e915-c2fd-58de-93a8-2aa81ac524af');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('10f3f087-fc02-590a-b797-a1b4460f14ef', '40092c7a-3739-51c2-a4be-06861f21b31d');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('10f3f087-fc02-590a-b797-a1b4460f14ef', '53bc7f66-eca7-5e6c-b2f0-90a46f2be45a');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('10f3f087-fc02-590a-b797-a1b4460f14ef', '56da7ba6-697d-532a-ae6f-e596255a733e');
INSERT INTO pandit_temples (pandit_id, temple_id, is_primary) VALUES ('10f3f087-fc02-590a-b797-a1b4460f14ef', 'eefad424-582d-5135-bdd5-40b44157fea3', TRUE);
INSERT INTO pandit_temples (pandit_id, temple_id, is_primary) VALUES ('10f3f087-fc02-590a-b797-a1b4460f14ef', 'e26626f2-7638-514e-87e2-4dd3cf0161ec', FALSE);
INSERT INTO pandit_certificates (pandit_id, certificate_name, is_verified) VALUES ('10f3f087-fc02-590a-b797-a1b4460f14ef', 'Shastri (Ramcharitmanas), Ayodhya Sanskrit Mahavidyalaya', TRUE);
INSERT INTO pandit_languages (pandit_id, language) VALUES ('a08063d0-8621-596b-8ea4-baa45e073063', 'Marathi');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('a08063d0-8621-596b-8ea4-baa45e073063', 'Hindi');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('a08063d0-8621-596b-8ea4-baa45e073063', 'Sanskrit');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('a08063d0-8621-596b-8ea4-baa45e073063', '742bcb1e-9f75-5ef0-b61a-00f76d8655ca');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('a08063d0-8621-596b-8ea4-baa45e073063', '9b2e0d02-a574-5016-838a-f26ae25849ac');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('a08063d0-8621-596b-8ea4-baa45e073063', 'bbb8c252-9415-578a-aedb-59a584806ca6');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('a08063d0-8621-596b-8ea4-baa45e073063', '77e16ac4-64c1-5d26-a30c-c92f0a9f866c');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('a08063d0-8621-596b-8ea4-baa45e073063', 'd4c0d2c2-9bdd-554f-ac1b-117da63fa953');
INSERT INTO pandit_temples (pandit_id, temple_id, is_primary) VALUES ('a08063d0-8621-596b-8ea4-baa45e073063', 'd0e9c36c-4f3b-568b-a3ca-5873b3d00e5f', TRUE);
INSERT INTO pandit_temples (pandit_id, temple_id, is_primary) VALUES ('a08063d0-8621-596b-8ea4-baa45e073063', 'fffd6438-b32c-568b-89d1-b8007d923907', FALSE);
INSERT INTO pandit_certificates (pandit_id, certificate_name, is_verified) VALUES ('a08063d0-8621-596b-8ea4-baa45e073063', 'Ved Murti, Trimbakeshwar Vedshala', TRUE);
INSERT INTO pandit_languages (pandit_id, language) VALUES ('74812001-07ef-5876-ac6f-6e2cf186886d', 'Tamil');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('74812001-07ef-5876-ac6f-6e2cf186886d', 'Telugu');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('74812001-07ef-5876-ac6f-6e2cf186886d', 'Sanskrit');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('74812001-07ef-5876-ac6f-6e2cf186886d', 'English');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('74812001-07ef-5876-ac6f-6e2cf186886d', '3333357a-4d3a-527b-b4e8-0dd61a5f5a9a');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('74812001-07ef-5876-ac6f-6e2cf186886d', '40092c7a-3739-51c2-a4be-06861f21b31d');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('74812001-07ef-5876-ac6f-6e2cf186886d', '9556a5f0-29d5-52e0-9e9b-8eeebb74bf3a');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('74812001-07ef-5876-ac6f-6e2cf186886d', '76ef4675-410c-51ec-aec9-a2635e9d7b2e');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('74812001-07ef-5876-ac6f-6e2cf186886d', 'f14af272-f9fd-5ea4-9ff7-cda0374fdc80');
INSERT INTO pandit_temples (pandit_id, temple_id, is_primary) VALUES ('74812001-07ef-5876-ac6f-6e2cf186886d', 'a7dfbac7-c051-5c5b-8625-41948dd108eb', TRUE);
INSERT INTO pandit_temples (pandit_id, temple_id, is_primary) VALUES ('74812001-07ef-5876-ac6f-6e2cf186886d', '75f34963-b5e1-5a70-9c5c-5429ecb7d41d', FALSE);
INSERT INTO pandit_certificates (pandit_id, certificate_name, is_verified) VALUES ('74812001-07ef-5876-ac6f-6e2cf186886d', 'Ghanapaathi (Yajur Veda), Madurai Veda Patasala', TRUE);
INSERT INTO pandit_languages (pandit_id, language) VALUES ('364cd69f-bf8b-5b27-9c78-e93d10b7dfcd', 'Odia');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('364cd69f-bf8b-5b27-9c78-e93d10b7dfcd', 'Hindi');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('364cd69f-bf8b-5b27-9c78-e93d10b7dfcd', 'Sanskrit');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('364cd69f-bf8b-5b27-9c78-e93d10b7dfcd', 'Bengali');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('364cd69f-bf8b-5b27-9c78-e93d10b7dfcd', '9b2e0d02-a574-5016-838a-f26ae25849ac');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('364cd69f-bf8b-5b27-9c78-e93d10b7dfcd', '550f458b-37ea-544a-b003-2b65d98d23f9');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('364cd69f-bf8b-5b27-9c78-e93d10b7dfcd', '9677e915-c2fd-58de-93a8-2aa81ac524af');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('364cd69f-bf8b-5b27-9c78-e93d10b7dfcd', '56b6a10e-594f-547c-8089-b018eda82497');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('364cd69f-bf8b-5b27-9c78-e93d10b7dfcd', '53bc7f66-eca7-5e6c-b2f0-90a46f2be45a');
INSERT INTO pandit_temples (pandit_id, temple_id, is_primary) VALUES ('364cd69f-bf8b-5b27-9c78-e93d10b7dfcd', '5e2e7e25-ac94-5986-b843-cacd23da3b56', TRUE);
INSERT INTO pandit_certificates (pandit_id, certificate_name, is_verified) VALUES ('364cd69f-bf8b-5b27-9c78-e93d10b7dfcd', 'Shastri (Puran), Puri Sanskrit College', TRUE);
INSERT INTO pandit_languages (pandit_id, language) VALUES ('78e7167f-c063-58ac-a090-4828679a2789', 'Hindi');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('78e7167f-c063-58ac-a090-4828679a2789', 'Braj');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('78e7167f-c063-58ac-a090-4828679a2789', 'Sanskrit');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('78e7167f-c063-58ac-a090-4828679a2789', '550f458b-37ea-544a-b003-2b65d98d23f9');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('78e7167f-c063-58ac-a090-4828679a2789', '53bc7f66-eca7-5e6c-b2f0-90a46f2be45a');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('78e7167f-c063-58ac-a090-4828679a2789', '994d8b80-ceb7-55ac-830f-295e83466106');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('78e7167f-c063-58ac-a090-4828679a2789', '9556a5f0-29d5-52e0-9e9b-8eeebb74bf3a');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('78e7167f-c063-58ac-a090-4828679a2789', '56b6a10e-594f-547c-8089-b018eda82497');
INSERT INTO pandit_temples (pandit_id, temple_id, is_primary) VALUES ('78e7167f-c063-58ac-a090-4828679a2789', 'e26626f2-7638-514e-87e2-4dd3cf0161ec', TRUE);
INSERT INTO pandit_temples (pandit_id, temple_id, is_primary) VALUES ('78e7167f-c063-58ac-a090-4828679a2789', 'eee43db2-e65f-5c78-9143-1c754f28d754', FALSE);
INSERT INTO pandit_certificates (pandit_id, certificate_name, is_verified) VALUES ('78e7167f-c063-58ac-a090-4828679a2789', 'Acharya (Bhagwat), Vrindavan Shodh Sansthan', TRUE);
INSERT INTO pandit_languages (pandit_id, language) VALUES ('7f13ecb0-64f8-5177-b6b9-759e93d23799', 'Hindi');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('7f13ecb0-64f8-5177-b6b9-759e93d23799', 'Garhwali');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('7f13ecb0-64f8-5177-b6b9-759e93d23799', 'Sanskrit');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('7f13ecb0-64f8-5177-b6b9-759e93d23799', 'English');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('7f13ecb0-64f8-5177-b6b9-759e93d23799', 'b74daca0-9d20-568e-aea9-9036f6f907eb');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('7f13ecb0-64f8-5177-b6b9-759e93d23799', '2b2ea34a-4a98-59b7-b6da-87507ccef7db');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('7f13ecb0-64f8-5177-b6b9-759e93d23799', '9b2e0d02-a574-5016-838a-f26ae25849ac');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('7f13ecb0-64f8-5177-b6b9-759e93d23799', 'd9b011e0-0cbf-5d0a-995e-9c30148e718b');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('7f13ecb0-64f8-5177-b6b9-759e93d23799', '9677e915-c2fd-58de-93a8-2aa81ac524af');
INSERT INTO pandit_temples (pandit_id, temple_id, is_primary) VALUES ('7f13ecb0-64f8-5177-b6b9-759e93d23799', '97c4197b-3741-50c5-a0a7-8e3d8d357a90', TRUE);
INSERT INTO pandit_certificates (pandit_id, certificate_name, is_verified) VALUES ('7f13ecb0-64f8-5177-b6b9-759e93d23799', 'Shastri (Karmakand), Gurukul Kangri', TRUE);
INSERT INTO pandit_languages (pandit_id, language) VALUES ('864b0d69-fb7d-5344-afcc-cf42d4910f39', 'Telugu');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('864b0d69-fb7d-5344-afcc-cf42d4910f39', 'Tamil');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('864b0d69-fb7d-5344-afcc-cf42d4910f39', 'Sanskrit');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('864b0d69-fb7d-5344-afcc-cf42d4910f39', 'English');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('864b0d69-fb7d-5344-afcc-cf42d4910f39', 'b74daca0-9d20-568e-aea9-9036f6f907eb');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('864b0d69-fb7d-5344-afcc-cf42d4910f39', '9556a5f0-29d5-52e0-9e9b-8eeebb74bf3a');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('864b0d69-fb7d-5344-afcc-cf42d4910f39', '40092c7a-3739-51c2-a4be-06861f21b31d');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('864b0d69-fb7d-5344-afcc-cf42d4910f39', '3333357a-4d3a-527b-b4e8-0dd61a5f5a9a');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('864b0d69-fb7d-5344-afcc-cf42d4910f39', 'f14af272-f9fd-5ea4-9ff7-cda0374fdc80');
INSERT INTO pandit_temples (pandit_id, temple_id, is_primary) VALUES ('864b0d69-fb7d-5344-afcc-cf42d4910f39', '75f34963-b5e1-5a70-9c5c-5429ecb7d41d', TRUE);
INSERT INTO pandit_certificates (pandit_id, certificate_name, is_verified) VALUES ('864b0d69-fb7d-5344-afcc-cf42d4910f39', 'Vedanta Vidwan, Tirumala Veda Patasala', TRUE);
INSERT INTO pandit_languages (pandit_id, language) VALUES ('5addaad2-e05a-5dd0-90a5-4739d9d6bcd4', 'Gujarati');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('5addaad2-e05a-5dd0-90a5-4739d9d6bcd4', 'Hindi');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('5addaad2-e05a-5dd0-90a5-4739d9d6bcd4', 'Sanskrit');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('5addaad2-e05a-5dd0-90a5-4739d9d6bcd4', '550f458b-37ea-544a-b003-2b65d98d23f9');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('5addaad2-e05a-5dd0-90a5-4739d9d6bcd4', '3333357a-4d3a-527b-b4e8-0dd61a5f5a9a');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('5addaad2-e05a-5dd0-90a5-4739d9d6bcd4', '06a148ae-df90-5d9b-b5f4-768e9002c13b');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('5addaad2-e05a-5dd0-90a5-4739d9d6bcd4', '726b9c60-e3ba-50cd-a451-349aff410f01');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('5addaad2-e05a-5dd0-90a5-4739d9d6bcd4', '53bc7f66-eca7-5e6c-b2f0-90a46f2be45a');
INSERT INTO pandit_temples (pandit_id, temple_id, is_primary) VALUES ('5addaad2-e05a-5dd0-90a5-4739d9d6bcd4', 'afca3764-28ec-5a02-97be-c9a501b899d2', TRUE);
INSERT INTO pandit_certificates (pandit_id, certificate_name, is_verified) VALUES ('5addaad2-e05a-5dd0-90a5-4739d9d6bcd4', 'Shastri (Veda), Dwarka Sharda Peeth', TRUE);
INSERT INTO pandit_languages (pandit_id, language) VALUES ('41e8fc01-72ea-5800-8a18-a578be661d4d', 'Assamese');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('41e8fc01-72ea-5800-8a18-a578be661d4d', 'Bengali');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('41e8fc01-72ea-5800-8a18-a578be661d4d', 'Hindi');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('41e8fc01-72ea-5800-8a18-a578be661d4d', 'Sanskrit');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('41e8fc01-72ea-5800-8a18-a578be661d4d', '76ef4675-410c-51ec-aec9-a2635e9d7b2e');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('41e8fc01-72ea-5800-8a18-a578be661d4d', '301053d0-abcb-5fe3-a4d3-f34f463d7eaf');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('41e8fc01-72ea-5800-8a18-a578be661d4d', 'e17144c1-8f56-59b4-91c4-9a8e2e70872d');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('41e8fc01-72ea-5800-8a18-a578be661d4d', 'bbb8c252-9415-578a-aedb-59a584806ca6');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('41e8fc01-72ea-5800-8a18-a578be661d4d', 'f14af272-f9fd-5ea4-9ff7-cda0374fdc80');
INSERT INTO pandit_temples (pandit_id, temple_id, is_primary) VALUES ('41e8fc01-72ea-5800-8a18-a578be661d4d', '43c26630-a502-50cd-ba65-aa6587b8aa32', TRUE);
INSERT INTO pandit_certificates (pandit_id, certificate_name, is_verified) VALUES ('41e8fc01-72ea-5800-8a18-a578be661d4d', 'Tantra Acharya, Kamakhya Peeth', TRUE);
INSERT INTO pandit_languages (pandit_id, language) VALUES ('e86e45ca-0967-5800-b8ba-35a304cc1e61', 'Hindi');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('e86e45ca-0967-5800-b8ba-35a304cc1e61', 'Marathi');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('e86e45ca-0967-5800-b8ba-35a304cc1e61', 'English');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('e86e45ca-0967-5800-b8ba-35a304cc1e61', 'Sanskrit');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('e86e45ca-0967-5800-b8ba-35a304cc1e61', '994d8b80-ceb7-55ac-830f-295e83466106');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('e86e45ca-0967-5800-b8ba-35a304cc1e61', 'e2a08f68-0e01-5c2d-ab63-ebcc14dbbb03');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('e86e45ca-0967-5800-b8ba-35a304cc1e61', '06a148ae-df90-5d9b-b5f4-768e9002c13b');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('e86e45ca-0967-5800-b8ba-35a304cc1e61', '726b9c60-e3ba-50cd-a451-349aff410f01');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('e86e45ca-0967-5800-b8ba-35a304cc1e61', '4ea6d01a-ca07-5ce8-bd8e-ebffade3672b');
INSERT INTO pandit_temples (pandit_id, temple_id, is_primary) VALUES ('e86e45ca-0967-5800-b8ba-35a304cc1e61', 'fffd6438-b32c-568b-89d1-b8007d923907', TRUE);
INSERT INTO pandit_certificates (pandit_id, certificate_name, is_verified) VALUES ('e86e45ca-0967-5800-b8ba-35a304cc1e61', 'Ved Shastri, Mumbai Ved Vidyalaya', TRUE);
INSERT INTO pandit_languages (pandit_id, language) VALUES ('5c519924-358e-51fb-8291-28bb2d948c8e', 'Hindi');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('5c519924-358e-51fb-8291-28bb2d948c8e', 'English');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('5c519924-358e-51fb-8291-28bb2d948c8e', 'Punjabi');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('5c519924-358e-51fb-8291-28bb2d948c8e', 'Sanskrit');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('5c519924-358e-51fb-8291-28bb2d948c8e', '06a148ae-df90-5d9b-b5f4-768e9002c13b');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('5c519924-358e-51fb-8291-28bb2d948c8e', '76ef4675-410c-51ec-aec9-a2635e9d7b2e');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('5c519924-358e-51fb-8291-28bb2d948c8e', 'e17144c1-8f56-59b4-91c4-9a8e2e70872d');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('5c519924-358e-51fb-8291-28bb2d948c8e', 'b74daca0-9d20-568e-aea9-9036f6f907eb');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('5c519924-358e-51fb-8291-28bb2d948c8e', 'a0c98bfd-c567-53a3-98c0-93df7b157fd5');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('5c519924-358e-51fb-8291-28bb2d948c8e', '64385023-a98b-52c8-a0cc-26531056bbaf');
INSERT INTO pandit_temples (pandit_id, temple_id, is_primary) VALUES ('5c519924-358e-51fb-8291-28bb2d948c8e', '058eb67e-4583-5362-a9dc-450f2b847bee', TRUE);
INSERT INTO pandit_certificates (pandit_id, certificate_name, is_verified) VALUES ('5c519924-358e-51fb-8291-28bb2d948c8e', 'Shastri (Karmakand), Delhi Sanskrit Academy', TRUE);
INSERT INTO pandit_languages (pandit_id, language) VALUES ('52b8ccb2-1405-5afe-bb91-f624feb31ec1', 'Hindi');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('52b8ccb2-1405-5afe-bb91-f624feb31ec1', 'Marwari');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('52b8ccb2-1405-5afe-bb91-f624feb31ec1', 'Sanskrit');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('52b8ccb2-1405-5afe-bb91-f624feb31ec1', 'English');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('52b8ccb2-1405-5afe-bb91-f624feb31ec1', '3333357a-4d3a-527b-b4e8-0dd61a5f5a9a');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('52b8ccb2-1405-5afe-bb91-f624feb31ec1', 'f14af272-f9fd-5ea4-9ff7-cda0374fdc80');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('52b8ccb2-1405-5afe-bb91-f624feb31ec1', '550f458b-37ea-544a-b003-2b65d98d23f9');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('52b8ccb2-1405-5afe-bb91-f624feb31ec1', '9556a5f0-29d5-52e0-9e9b-8eeebb74bf3a');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('52b8ccb2-1405-5afe-bb91-f624feb31ec1', 'bbb8c252-9415-578a-aedb-59a584806ca6');
INSERT INTO pandit_temples (pandit_id, temple_id, is_primary) VALUES ('52b8ccb2-1405-5afe-bb91-f624feb31ec1', 'eee43db2-e65f-5c78-9143-1c754f28d754', TRUE);
INSERT INTO pandit_certificates (pandit_id, certificate_name, is_verified) VALUES ('52b8ccb2-1405-5afe-bb91-f624feb31ec1', 'Acharya (Jyotish), Jagatguru Ramanandacharya University', TRUE);
INSERT INTO pandit_languages (pandit_id, language) VALUES ('00c04647-d82b-5b78-bafb-b7a0da1e7bb1', 'Hindi');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('00c04647-d82b-5b78-bafb-b7a0da1e7bb1', 'English');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('00c04647-d82b-5b78-bafb-b7a0da1e7bb1', 'Sanskrit');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('00c04647-d82b-5b78-bafb-b7a0da1e7bb1', '30af3b0c-91ac-5cb0-8167-c853844a6cfd');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('00c04647-d82b-5b78-bafb-b7a0da1e7bb1', '994d8b80-ceb7-55ac-830f-295e83466106');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('00c04647-d82b-5b78-bafb-b7a0da1e7bb1', '53bc7f66-eca7-5e6c-b2f0-90a46f2be45a');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('00c04647-d82b-5b78-bafb-b7a0da1e7bb1', '40092c7a-3739-51c2-a4be-06861f21b31d');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('00c04647-d82b-5b78-bafb-b7a0da1e7bb1', 'c6029093-3a6f-5aa0-a38d-d88117ad378d');
INSERT INTO pandit_temples (pandit_id, temple_id, is_primary) VALUES ('00c04647-d82b-5b78-bafb-b7a0da1e7bb1', '8eaaf858-ccfb-5889-a84b-72c2889eceac', TRUE);
INSERT INTO pandit_certificates (pandit_id, certificate_name, is_verified) VALUES ('00c04647-d82b-5b78-bafb-b7a0da1e7bb1', 'Shastri (Veda), BHU', TRUE);
INSERT INTO pandit_languages (pandit_id, language) VALUES ('520d0d5c-5e32-555b-8bf9-094bd941747f', 'Hindi');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('520d0d5c-5e32-555b-8bf9-094bd941747f', 'Sanskrit');
INSERT INTO pandit_languages (pandit_id, language) VALUES ('520d0d5c-5e32-555b-8bf9-094bd941747f', 'Gujarati');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('520d0d5c-5e32-555b-8bf9-094bd941747f', 'a977f744-ac67-5fb3-8cfa-c62a377b9da2');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('520d0d5c-5e32-555b-8bf9-094bd941747f', '76ef4675-410c-51ec-aec9-a2635e9d7b2e');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('520d0d5c-5e32-555b-8bf9-094bd941747f', '9677e915-c2fd-58de-93a8-2aa81ac524af');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('520d0d5c-5e32-555b-8bf9-094bd941747f', '9b2e0d02-a574-5016-838a-f26ae25849ac');
INSERT INTO pandit_services (pandit_id, service_id) VALUES ('520d0d5c-5e32-555b-8bf9-094bd941747f', '1c5de8aa-27a3-5aba-aa4b-6e86baf88b33');
INSERT INTO pandit_temples (pandit_id, temple_id, is_primary) VALUES ('520d0d5c-5e32-555b-8bf9-094bd941747f', '688beda2-fa0c-53a5-a9f5-36e53be41dfd', TRUE);
INSERT INTO pandit_certificates (pandit_id, certificate_name, is_verified) VALUES ('520d0d5c-5e32-555b-8bf9-094bd941747f', 'Mahamahopadhyaya (Veda), Ujjain', TRUE);

-- subscription_plans
INSERT INTO subscription_plans (name, tier, price_monthly, features, is_popular, display_order)
       VALUES ('Free', 'free', 0, '{"highlights":["Basic profile","1 temple listing","Standard search placement","Up to 3 services"],"cta":"Current plan","per":"forever"}'::jsonb, FALSE, 0);
INSERT INTO subscription_plans (name, tier, price_monthly, features, is_popular, display_order)
       VALUES ('Silver', 'silver', 299, '{"highlights":["Verified badge","5 temple listings","60-sec video intro","Priority in search","Unlimited services"],"cta":"Upgrade","per":"/month"}'::jsonb, FALSE, 1);
INSERT INTO subscription_plans (name, tier, price_monthly, features, is_popular, display_order)
       VALUES ('Gold', 'gold', 599, '{"highlights":["Everything in Silver","Homepage featuring","Analytics dashboard","QR profile code","Review response tools"],"cta":"Upgrade","per":"/month"}'::jsonb, TRUE, 2);
INSERT INTO subscription_plans (name, tier, price_monthly, features, is_popular, display_order)
       VALUES ('Diamond', 'diamond', 999, '{"highlights":["Everything in Gold","Top placement always","Multi-city listing","Dedicated support line","Leaderboard eligibility"],"cta":"Upgrade","per":"/month"}'::jsonb, FALSE, 3);

-- reviews (site testimonials, best-effort matched to a pandit offering that service)
INSERT INTO users (id, email, full_name, role, status, city, password_hash, email_verified)
       VALUES ('1c80a0dd-55e1-5e48-bc55-e5855bbb1605', 'reviewer-0@panditconnect.demo', 'Ankit Verma', 'devotee', 'active', 'Lucknow', '$2a$10$/rI1Tv/I8AqUANqddIo6t.SwzUjWLN/09RvLRmStBgoravFBun5ym', TRUE);
INSERT INTO reviews (user_id, reviewable_type, reviewable_id, rating, body, service_id, is_approved)
       VALUES ('1c80a0dd-55e1-5e48-bc55-e5855bbb1605', 'pandit', '31ed3761-5a33-518c-8ea6-d9186ce7fc4d', 5, 'Pandit ji ke saath direct baat hui, koi middleman nahi. Griha Pravesh ke liye samagri list pehle hi WhatsApp par mil gayi — sab kuch time par ho gaya.', '06a148ae-df90-5d9b-b5f4-768e9002c13b', TRUE);
INSERT INTO users (id, email, full_name, role, status, city, password_hash, email_verified)
       VALUES ('74770e4a-ffb3-5e18-8590-b62c162eb808', 'reviewer-1@panditconnect.demo', 'Priya Nair', 'devotee', 'active', 'Bengaluru', '$2a$10$/rI1Tv/I8AqUANqddIo6t.SwzUjWLN/09RvLRmStBgoravFBun5ym', TRUE);
INSERT INTO reviews (user_id, reviewable_type, reviewable_id, rating, body, service_id, is_approved)
       VALUES ('74770e4a-ffb3-5e18-8590-b62c162eb808', 'pandit', '31ed3761-5a33-518c-8ea6-d9186ce7fc4d', 5, 'We needed a Tamil-speaking pandit in Madurai for our wedding. Found three profiles with video intros, spoke to two on call, and booked the one we connected with. No commission, no pressure.', '3333357a-4d3a-527b-b4e8-0dd61a5f5a9a', TRUE);
INSERT INTO users (id, email, full_name, role, status, city, password_hash, email_verified)
       VALUES ('f5e77ac8-0e50-5a43-a17e-c1e28222649f', 'reviewer-2@panditconnect.demo', 'Rohit Deshmukh', 'devotee', 'active', 'Pune', '$2a$10$/rI1Tv/I8AqUANqddIo6t.SwzUjWLN/09RvLRmStBgoravFBun5ym', TRUE);
INSERT INTO reviews (user_id, reviewable_type, reviewable_id, rating, body, service_id, is_approved)
       VALUES ('f5e77ac8-0e50-5a43-a17e-c1e28222649f', 'pandit', 'e418106d-e5bb-5ffa-8593-4186247fd003', 5, 'Kaal Sarp dosh puja Trimbakeshwar mein karani thi. Platform par temple ke saath jude pandit ji mile — verification aur certificate dono dikhe. Bharosa ho gaya.', '742bcb1e-9f75-5ef0-b61a-00f76d8655ca', TRUE);
INSERT INTO users (id, email, full_name, role, status, city, password_hash, email_verified)
       VALUES ('8772a480-8ebf-5c19-a010-52cd23355abc', 'reviewer-3@panditconnect.demo', 'Sneha Agarwal', 'devotee', 'active', 'Kolkata', '$2a$10$/rI1Tv/I8AqUANqddIo6t.SwzUjWLN/09RvLRmStBgoravFBun5ym', TRUE);
INSERT INTO reviews (user_id, reviewable_type, reviewable_id, rating, body, service_id, is_approved)
       VALUES ('8772a480-8ebf-5c19-a010-52cd23355abc', 'pandit', '74812001-07ef-5876-ac6f-6e2cf186886d', 4, 'Durga Saptashati path ke liye Kamakhya ke pandit ji se seedha contact hua. Reviews padh ke decide kiya. Bas mobile app aa jaye toh aur asaan ho.', '76ef4675-410c-51ec-aec9-a2635e9d7b2e', TRUE);
INSERT INTO users (id, email, full_name, role, status, city, password_hash, email_verified)
       VALUES ('157c699a-1b62-5d6d-9df2-6bedabfe5525', 'reviewer-4@panditconnect.demo', 'Karthik Menon', 'devotee', 'active', 'Dubai', '$2a$10$/rI1Tv/I8AqUANqddIo6t.SwzUjWLN/09RvLRmStBgoravFBun5ym', TRUE);
INSERT INTO reviews (user_id, reviewable_type, reviewable_id, rating, body, service_id, is_approved)
       VALUES ('157c699a-1b62-5d6d-9df2-6bedabfe5525', 'pandit', 'a08063d0-8621-596b-8ea4-baa45e073063', 5, 'Living abroad, arranging my father''s Shradh in Haridwar was my biggest worry. The pandit ji did a video call during the tarpan so we could all participate. Deeply grateful.', '9b2e0d02-a574-5016-838a-f26ae25849ac', TRUE);
INSERT INTO users (id, email, full_name, role, status, city, password_hash, email_verified)
       VALUES ('514d6e5d-208e-5761-a527-6c54cf51e8d0', 'reviewer-5@panditconnect.demo', 'Manish Jain', 'devotee', 'active', 'Indore', '$2a$10$/rI1Tv/I8AqUANqddIo6t.SwzUjWLN/09RvLRmStBgoravFBun5ym', TRUE);
INSERT INTO reviews (user_id, reviewable_type, reviewable_id, rating, body, service_id, is_approved)
       VALUES ('514d6e5d-208e-5761-a527-6c54cf51e8d0', 'pandit', '5addaad2-e05a-5dd0-90a5-4739d9d6bcd4', 5, 'Shop opening ka muhurat aur puja dono same pandit ji ne kiya. Kundali dekhi, phir date batayi. Direct call feature sabse best hai.', '726b9c60-e3ba-50cd-a451-349aff410f01', TRUE);

-- blog_posts
INSERT INTO blog_posts (author_id, title, slug, excerpt, body, category, status, published_at)
       VALUES ('d7943536-ef8b-5d7f-aeac-7bc0e2ac13ed', 'Griha Pravesh: complete vidhi, samagri and muhurat guide', 'griha-pravesh-guide', 'What actually happens during a Griha Pravesh puja, why Vastu Shanti comes first, and the twelve samagri items families most often forget.', 'What actually happens during a Griha Pravesh puja, why Vastu Shanti comes first, and the twelve samagri items families most often forget.', 'Rituals', 'published', '2026-07-11T18:30:00.000Z');
INSERT INTO blog_posts (author_id, title, slug, excerpt, body, category, status, published_at)
       VALUES ('d7943536-ef8b-5d7f-aeac-7bc0e2ac13ed', 'Why we will never take a commission on your puja', 'why-no-middleman', 'Most platforms sit between you and the pandit and keep 20–30%. Here is how our directory model works instead, and what it means for both sides.', 'Most platforms sit between you and the pandit and keep 20–30%. Here is how our directory model works instead, and what it means for both sides.', 'PanditConnect', 'published', '2026-07-03T18:30:00.000Z');
INSERT INTO blog_posts (author_id, title, slug, excerpt, body, category, status, published_at)
       VALUES ('d7943536-ef8b-5d7f-aeac-7bc0e2ac13ed', 'Kaal Sarp Yog: what it is, and what it is not', 'kaal-sarp-explained', 'A calm, non-alarmist explanation of the Rahu–Ketu axis, when a remedy is genuinely advised, and why Trimbakeshwar and Ujjain are the traditional venues.', 'A calm, non-alarmist explanation of the Rahu–Ketu axis, when a remedy is genuinely advised, and why Trimbakeshwar and Ujjain are the traditional venues.', 'Jyotish', 'published', '2026-06-27T18:30:00.000Z');
INSERT INTO blog_posts (author_id, title, slug, excerpt, body, category, status, published_at)
       VALUES ('d7943536-ef8b-5d7f-aeac-7bc0e2ac13ed', 'Seven questions to ask a pandit ji before your ceremony', 'choose-pandit', 'Gotra, tradition, language, duration, samagri responsibility, dakshina clarity and travel — settle these on the first call and the day goes smoothly.', 'Gotra, tradition, language, duration, samagri responsibility, dakshina clarity and travel — settle these on the first call and the day goes smoothly.', 'Guides', 'published', '2026-06-20T18:30:00.000Z');
INSERT INTO blog_posts (author_id, title, slug, excerpt, body, category, status, published_at)
       VALUES ('d7943536-ef8b-5d7f-aeac-7bc0e2ac13ed', 'Navratri 2026: Ghatasthapana muhurat and nine-day vidhi', 'navratri-2026', 'Day-by-day Devi worship, jawara sowing, akhand jyoti rules and the Ashtami–Navami hawan timings for 2026.', 'Day-by-day Devi worship, jawara sowing, akhand jyoti rules and the Ashtami–Navami hawan timings for 2026.', 'Festivals', 'published', '2026-06-14T18:30:00.000Z');
INSERT INTO blog_posts (author_id, title, slug, excerpt, body, category, status, published_at)
       VALUES ('d7943536-ef8b-5d7f-aeac-7bc0e2ac13ed', 'Arranging Shradh from abroad: a practical checklist', 'shradh-abroad', 'Tithi calculation across time zones, choosing between Gaya, Haridwar and Puri, video participation, and what to send in advance.', 'Tithi calculation across time zones, choosing between Gaya, Haridwar and Puri, video participation, and what to send in advance.', 'Guides', 'published', '2026-06-07T18:30:00.000Z');
INSERT INTO blog_posts (author_id, title, slug, excerpt, body, category, status, published_at)
       VALUES ('d7943536-ef8b-5d7f-aeac-7bc0e2ac13ed', 'Puja samagri basics: what each item actually means', 'samagri-basics', 'Akshat, kalava, panchamrit, durva, bel patra — the reasoning behind the common items on every samagri list.', 'Akshat, kalava, panchamrit, durva, bel patra — the reasoning behind the common items on every samagri list.', 'Rituals', 'published', '2026-05-29T18:30:00.000Z');
INSERT INTO blog_posts (author_id, title, slug, excerpt, body, category, status, published_at)
       VALUES ('d7943536-ef8b-5d7f-aeac-7bc0e2ac13ed', 'Muhurat myths that cost families time and money', 'muhurat-myths', 'Not every day needs a paid muhurat consultation. Here is when timing genuinely matters and when a Brahma muhurat start is enough.', 'Not every day needs a paid muhurat consultation. Here is when timing genuinely matters and when a Brahma muhurat start is enough.', 'Jyotish', 'published', '2026-05-21T18:30:00.000Z');
INSERT INTO blog_posts (author_id, title, slug, excerpt, body, category, status, published_at)
       VALUES ('d7943536-ef8b-5d7f-aeac-7bc0e2ac13ed', 'How temple sevas are verified before a listing goes live', 'temple-seva', 'Our four-step process: document check, video KYC, temple confirmation and a review-integrity audit every six months.', 'Our four-step process: document check, video KYC, temple confirmation and a review-integrity audit every six months.', 'PanditConnect', 'published', '2026-05-13T18:30:00.000Z');

-- faqs
INSERT INTO faqs (question, answer, display_order) VALUES ('Do you charge commission on my puja?', 'No. PanditConnect is a directory, not a booking agent. You contact the pandit ji directly on WhatsApp or call, and you settle dakshina and samagri arrangements with them. We never sit in the middle of that transaction and take nothing from it.', 0);
INSERT INTO faqs (question, answer, display_order) VALUES ('Then how does PanditConnect earn?', 'Pandits may optionally subscribe to a paid tier (Silver, Gold or Diamond) for a verified badge, more listings and better placement. Temples can promote events. We also run relevant ads on content pages. Your connection with a pandit ji is always free.', 1);
INSERT INTO faqs (question, answer, display_order) VALUES ('How are pandits verified?', 'Four steps: identity and address documents, a video KYC call, confirmation from the temple they are associated with, and Vedic education certificate checks. Verified profiles carry the gold tick. We re-audit reviews every six months.', 2);
INSERT INTO faqs (question, answer, display_order) VALUES ('Can I request a pandit who speaks my language?', 'Yes. Every profile lists the languages the pandit ji speaks, and you can filter the Pandit Directory by language along with city, service, rating and experience.', 3);
INSERT INTO faqs (question, answer, display_order) VALUES ('I live abroad. Can a puja be arranged for my family in India?', 'Many of our pandits conduct rituals with the family joining over video call, and several arrange the samagri locally. Mention it on your first message — most profiles note whether they offer online participation.', 4);
INSERT INTO faqs (question, answer, display_order) VALUES ('Who arranges the puja samagri?', 'That is between you and the pandit ji. Every service page on our site lists the standard samagri so you know what to expect, and you can decide together who brings what. Always confirm this on the first call.', 5);
INSERT INTO faqs (question, answer, display_order) VALUES ('Is there a mobile app?', 'The website is fully mobile-responsive and works like an app on your phone. Native Android and iOS apps are in development — join the newsletter to hear first.', 6);
INSERT INTO faqs (question, answer, display_order) VALUES ('I am a pandit. How do I list myself?', 'Register from the Pandit Dashboard, complete your profile with education details and temple association, and submit for verification. The basic listing is free and always will be.', 7);

-- stats
INSERT INTO stats (icon, number_label, label, display_order) VALUES ('user', '500+', 'Registered Pandits', 0);
INSERT INTO stats (icon, number_label, label, display_order) VALUES ('temple', '200+', 'Associated Temples', 1);
INSERT INTO stats (icon, number_label, label, display_order) VALUES ('kalash', '10,000+', 'Ceremonies Conducted', 2);
INSERT INTO stats (icon, number_label, label, display_order) VALUES ('map-pin', '60+', 'Cities Covered', 3);

-- taxonomy
INSERT INTO taxonomy (kind, value, display_order) VALUES ('city', 'Varanasi', 0);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('city', 'Ujjain', 1);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('city', 'Haridwar', 2);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('city', 'Mathura', 3);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('city', 'Ayodhya', 4);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('city', 'Tirupati', 5);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('city', 'Puri', 6);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('city', 'Madurai', 7);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('city', 'Nashik', 8);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('city', 'Dwarka', 9);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('city', 'Amritsar', 10);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('city', 'Guwahati', 11);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('city', 'Mumbai', 12);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('city', 'Delhi', 13);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('city', 'Jaipur', 14);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('state', 'Uttar Pradesh', 0);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('state', 'Madhya Pradesh', 1);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('state', 'Uttarakhand', 2);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('state', 'Andhra Pradesh', 3);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('state', 'Odisha', 4);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('state', 'Tamil Nadu', 5);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('state', 'Maharashtra', 6);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('state', 'Gujarat', 7);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('state', 'Punjab', 8);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('state', 'Assam', 9);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('state', 'Delhi', 10);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('state', 'Rajasthan', 11);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('language', 'Hindi', 0);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('language', 'English', 1);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('language', 'Sanskrit', 2);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('language', 'Marathi', 3);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('language', 'Tamil', 4);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('language', 'Telugu', 5);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('language', 'Bengali', 6);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('language', 'Gujarati', 7);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('language', 'Kannada', 8);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('language', 'Malayalam', 9);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('language', 'Punjabi', 10);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('language', 'Odia', 11);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('language', 'Assamese', 12);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('language', 'Bhojpuri', 13);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('language', 'Braj', 14);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('language', 'Garhwali', 15);
INSERT INTO taxonomy (kind, value, display_order) VALUES ('language', 'Marwari', 16);

-- recommend_rules
INSERT INTO recommend_rules (keywords, service_slugs, why) VALUES (ARRAY['new home', 'naya ghar', 'new house', 'flat', 'shifting', 'moving', 'griha'], ARRAY['griha-pravesh', 'satyanarayan-vrat', 'ganesh-puja'], 'Moving into a new home calls for Vastu Shanti and Griha Pravesh before the first night is spent there.');
INSERT INTO recommend_rules (keywords, service_slugs, why) VALUES (ARRAY['marriage', 'shaadi', 'wedding', 'vivah', 'engagement', 'sagai'], ARRAY['wedding', 'kundali', 'ganesh-puja'], 'For a marriage, kundali milan and muhurat come first, then the Vivah Sanskar itself.');
INSERT INTO recommend_rules (keywords, service_slugs, why) VALUES (ARRAY['health', 'illness', 'bimari', 'hospital', 'surgery', 'operation', 'recovery'], ARRAY['mahamrityunjay', 'rudrabhishek', 'durga-path'], 'Mahamrityunjay jaap is the traditional anusthan for health and recovery, often paired with Rudrabhishek.');
INSERT INTO recommend_rules (keywords, service_slugs, why) VALUES (ARRAY['money', 'paisa', 'loss', 'business', 'shop', 'office', 'job', 'career', 'promotion'], ARRAY['shop-opening', 'satyanarayan-diwali', 'satyanarayan-katha'], 'For business and financial matters, Lakshmi-Kuber puja and Satyanarayan Katha are the usual recommendations.');
INSERT INTO recommend_rules (keywords, service_slugs, why) VALUES (ARRAY['baby', 'child', 'bachcha', 'newborn', 'naming', 'mundan', 'annaprashan'], ARRAY['namkaran', 'mundan', 'annaprashan'], 'The childhood sanskars follow a sequence — Namkaran, Annaprashan, then Mundan on a shubh muhurat.');
INSERT INTO recommend_rules (keywords, service_slugs, why) VALUES (ARRAY['death', 'passed away', 'father', 'mother', 'shradh', 'pitru', 'ancestor', 'asthi'], ARRAY['pitru-dosh', 'antim-sanskar'], 'Shradh, Tarpan and Pind daan bring peace to ancestors; Haridwar, Gaya and Puri are the traditional venues.');
INSERT INTO recommend_rules (keywords, service_slugs, why) VALUES (ARRAY['planet', 'kundali', 'dosh', 'rahu', 'ketu', 'shani', 'sade sati', 'mangal', 'horoscope'], ARRAY['navgrah-shanti', 'kaal-sarp', 'satyanarayan-shanti', 'kundali'], 'Planetary troubles need a kundali reading first, then only the specific graha shanti your chart calls for.');
INSERT INTO recommend_rules (keywords, service_slugs, why) VALUES (ARRAY['fear', 'obstacle', 'rukavat', 'problem', 'tension', 'stress', 'peace', 'shanti'], ARRAY['sunderkand', 'havan-yagna', 'ganesh-puja'], 'Sunderkand path and a Ganesh havan are the gentle, widely-recommended remedies for obstacles and unease.');
INSERT INTO recommend_rules (keywords, service_slugs, why) VALUES (ARRAY['navratri', 'durga', 'devi', 'mata', 'jagran'], ARRAY['durga-path', 'navratri-sthapana', 'katha-jagran'], 'For Devi upasana, Durga Saptashati path and Kalash Sthapana are the core rituals.');
INSERT INTO recommend_rules (keywords, service_slugs, why) VALUES (ARRAY['construction', 'plot', 'land', 'building', 'foundation'], ARRAY['bhoomi-pujan', 'satyanarayan-vrat'], 'Bhoomi Pujan and Shilanyas are performed before construction begins on a plot.');
INSERT INTO recommend_rules (keywords, service_slugs, why) VALUES (ARRAY['diwali', 'lakshmi', 'ganesh chaturthi', 'holi', 'chhath', 'festival'], ARRAY['satyanarayan-diwali', 'ganesh-utsav', 'holika-dahan', 'chhath'], 'Festival pujas are muhurat-sensitive — booking a pandit ji two weeks ahead is wise.');
INSERT INTO recommend_rules (keywords, service_slugs, why) VALUES (ARRAY['thread', 'janeu', 'upanayan', 'yagyopavit'], ARRAY['janeu'], 'Upanayan Sanskar marks the start of Vedic study and is performed with Gayatri diksha.');

