# Changelog

## [1.5.0](https://github.com/alex-bluetrain/mostro/compare/v1.4.1...v1.5.0) (2026-08-17)


### Features

* enviar los logs del server a Axiom ([ec5cde9](https://github.com/alex-bluetrain/mostro/commit/ec5cde972d022c62120bee081593dcdaac01d963))

## [1.4.1](https://github.com/alex-bluetrain/mostro/compare/v1.4.0...v1.4.1) (2026-08-17)


### Bug Fixes

* saltear el poll si el dominio no tiene reglas en vez de fallar ([f623e37](https://github.com/alex-bluetrain/mostro/commit/f623e37603858532859931f9b9c02aae88db0682))

## [1.4.0](https://github.com/alex-bluetrain/mostro/compare/v1.3.0...v1.4.0) (2026-08-17)


### Features

* bootstrap automatico de reglas del clasificador desde env ([55b0180](https://github.com/alex-bluetrain/mostro/commit/55b01809b6cf0c46461d948e59eef62556596345))

## [1.3.0](https://github.com/alex-bluetrain/mostro/compare/v1.2.0...v1.3.0) (2026-08-17)


### Features

* servir Studio desde el server de prod para que el login funcione ([8c192af](https://github.com/alex-bluetrain/mostro/commit/8c192af41a7e573494e29b8e36491f53b107ad42))

## [1.2.0](https://github.com/alex-bluetrain/mostro/compare/v1.1.1...v1.2.0) (2026-08-16)


### Features

* SimpleAuth opcional por STUDIO_API_KEY para acceder a Studio en prod ([c69441d](https://github.com/alex-bluetrain/mostro/commit/c69441dff9cd32f94cdbcc84044b6f0807a75b72))

## [1.1.1](https://github.com/alex-bluetrain/mostro/compare/v1.1.0...v1.1.1) (2026-08-16)


### Bug Fixes

* NGROK_* should be optional (empty str or undefined) ([b64e942](https://github.com/alex-bluetrain/mostro/commit/b64e942954345b9f7b7d52cd5ad16c9a904f15e7))

## [1.1.0](https://github.com/alex-bluetrain/mostro/compare/v1.0.0...v1.1.0) (2026-08-16)


### Features

* add /start slash-command handler for invite redemption ([e8f0d69](https://github.com/alex-bluetrain/mostro/commit/e8f0d69521ff6b7c87224708841cb58aa3546d37))
* add a one-time script to obtain the Gmail refresh token ([92fabd1](https://github.com/alex-bluetrain/mostro/commit/92fabd1d61776169f535769a5f7a646d203327b3))
* add and register the inbox classifier agent ([d8e7cb4](https://github.com/alex-bluetrain/mostro/commit/d8e7cb4bdac1043e9a01b213249f9597cdc5ef0e))
* add composio gmail invite email sender ([c9f490b](https://github.com/alex-bluetrain/mostro/commit/c9f490b429ac84b8f6b6fc1de45dc390c5a53e28))
* add dry-run option for poll workflows ([6d033ef](https://github.com/alex-bluetrain/mostro/commit/6d033ef7748fea153284356b5f3d9efcb934f14d))
* add gmail reader for searching and labelling messages ([17a778e](https://github.com/alex-bluetrain/mostro/commit/17a778e5520159ea53aea85d7f0496f96bd53617))
* add identity resolution module ([030a7a9](https://github.com/alex-bluetrain/mostro/commit/030a7a9e18e47536a88c7c210f6eded347a9379b))
* add InboxClassifier happy path ([915259b](https://github.com/alex-bluetrain/mostro/commit/915259b93ee298c4fe3a84a4e87114db9ac91383))
* add invite mongoose model and schema ([c1cb519](https://github.com/alex-bluetrain/mostro/commit/c1cb519492f93c1256e15e400158da8f1503fa70))
* add invite repository with typed methods ([05fd99e](https://github.com/alex-bluetrain/mostro/commit/05fd99eb8c796de9ba40e45d42b2a965a89bf979))
* add mail extractor agent with a match-or-explain wrapper ([0bcea95](https://github.com/alex-bluetrain/mostro/commit/0bcea9578c561d6947bd877833ca23ae10e857db))
* add month helpers for resolving a mail to its order month ([217249b](https://github.com/alex-bluetrain/mostro/commit/217249be3edc358a4d27c9213a2700ecdb7f7c8a))
* add outbound email templates for the three domains ([f6c70b3](https://github.com/alex-bluetrain/mostro/commit/f6c70b3ec5fdfb8737657482cffe5484687e1a24))
* add redeem-time user provisioning upsert ([7480528](https://github.com/alex-bluetrain/mostro/commit/7480528591b8574e2d0d8f025d7b462f6ce1a394))
* add required Gmail settings to the environment schema ([6782aec](https://github.com/alex-bluetrain/mostro/commit/6782aec81ddc8c18d607a0ddd62972966dea31c6))
* add scheduled mailbox pollers for diapers, meds and refunds ([4d0684b](https://github.com/alex-bluetrain/mostro/commit/4d0684b01113e4781380d9ba7f1b6b7e6979fb7b))
* add strip-mail-body for the inbox classifier ([dd77742](https://github.com/alex-bluetrain/mostro/commit/dd77742aa74880e6b61bc626c5011a5e7ea2cc6e))
* add subscriber mongoose model and schema ([2797b19](https://github.com/alex-bluetrain/mostro/commit/2797b196c28fcd028111a4f55f9a1d2fa865cc66))
* add subscriber repository with typed methods ([39b9f66](https://github.com/alex-bluetrain/mostro/commit/39b9f66a590b7b0acf1b75f1aca6803075c2fc41))
* add the polling cycle that routes mail by suspended step ([3684fb6](https://github.com/alex-bluetrain/mostro/commit/3684fb6088a74f4b80488a0c1cc71cd33638b205))
* add user mongoose model and schema ([e2b388a](https://github.com/alex-bluetrain/mostro/commit/e2b388acaa5d5d37e75bfc16e866809548d5cffd))
* add user repository with typed methods ([9774919](https://github.com/alex-bluetrain/mostro/commit/9774919f1dd4da3cbabc416c0e1fd3e26874a431))
* admin invite tool and set-my-name tool ([7652b70](https://github.com/alex-bluetrain/mostro/commit/7652b7090dc0a77c8ff228a49d4441f479cf0b9b))
* authorize web login against the users collection ([4126e03](https://github.com/alex-bluetrain/mostro/commit/4126e03c2689d3531e395862cc1e87490005f9d5))
* build RFC 2822 messages for the Gmail API ([46f7a73](https://github.com/alex-bluetrain/mostro/commit/46f7a73860d6ed9163a74c9b03b8de3af50aca61))
* canonical user identity keyed by google email with named invites ([e1800dd](https://github.com/alex-bluetrain/mostro/commit/e1800dd4b9f6288d4ff486dae380cbedb6aa7bc0))
* capture telegram display name when redeeming an invite ([63d60f2](https://github.com/alex-bluetrain/mostro/commit/63d60f29fe18848fc54d89d9f1a8b06b73b863c6))
* create business module public API ([5e135d5](https://github.com/alex-bluetrain/mostro/commit/5e135d59cd4967888d2dbd2ea6529d849aea8432))
* derive the scoped year-month from a workflow run id ([1f9c005](https://github.com/alex-bluetrain/mostro/commit/1f9c0054bc7a01e6ca500b76b463d5fe5ac262e4))
* docker support ([e082b98](https://github.com/alex-bluetrain/mostro/commit/e082b98362ab42546bc691721a9f8d4fe91aefa8))
* email refund requests and deposit confirmations ([1b061c1](https://github.com/alex-bluetrain/mostro/commit/1b061c1f80ad5ff106d13d742b9c06d2dd1ba972))
* email the diaper order to the supplier ([2c14a5f](https://github.com/alex-bluetrain/mostro/commit/2c14a5ff8c3a7da23fabc23f72b6dee369feb9ff))
* email the medication order to the pharmacy ([882490b](https://github.com/alex-bluetrain/mostro/commit/882490bdc95ba3ffe40f1a270246a7d8101dd3d1))
* export repositories from index ([02df364](https://github.com/alex-bluetrain/mostro/commit/02df36487bf0b5f0574e4a706c37663ceb4d21b4))
* expose root MIME headers on InboxMessage ([4b0f6e8](https://github.com/alex-bluetrain/mostro/commit/4b0f6e87e74dc158478ab5a6c359656d9f2e356d))
* google auth on the mastra server with email allowlist ([245a8c8](https://github.com/alex-bluetrain/mostro/commit/245a8c8486b4bc5d9c94c32b2fa34bfbeb265c7a))
* guard diapers confirmation against invalid or non-suspended runs ([adddfd2](https://github.com/alex-bluetrain/mostro/commit/adddfd29eb06bfe6fb8df3582a69cfff794081d3))
* guard meds acknowledge and confirmation against invalid or non-suspended runs ([dc19748](https://github.com/alex-bluetrain/mostro/commit/dc1974812b82ae508bf63619bf87689f2ad26711))
* guard refunds ack, confirmation and deposit against invalid or non-suspended runs ([068037f](https://github.com/alex-bluetrain/mostro/commit/068037f5d3b36f015417b16b4422ec4e2effca74))
* guide agents to capture the requester name when an order lacks an author ([80abe96](https://github.com/alex-bluetrain/mostro/commit/80abe960efcd29958d2407c26f48524299d20f76))
* improved classifier (KISS principle) and cli for testing it ([dab3c6a](https://github.com/alex-bluetrain/mostro/commit/dab3c6a7178dea8803dc11e77f2520fb33913cb7))
* inbox-manager, mail-classifier, outcome-processor. ([e787dc4](https://github.com/alex-bluetrain/mostro/commit/e787dc4b1632a5ac25013ba0dc58ae9108ef2b29))
* infisical integration ([8dcb044](https://github.com/alex-bluetrain/mostro/commit/8dcb044319640656ddb701f8bef2bc5e1fa17af0))
* initialize mongoose connection in mastra index ([0e9c095](https://github.com/alex-bluetrain/mostro/commit/0e9c095df849e4a3d5f22556559749a80b04ccae))
* let admins requeue mails that failed to process ([6247383](https://github.com/alex-bluetrain/mostro/commit/62473831238d70a1d7e4e9514fe97cedba03bde9))
* notify domain subscribers when a mail cannot be processed ([0e96dba](https://github.com/alex-bluetrain/mostro/commit/0e96dba6c98067aa9ec642ce313b0b128353912b))
* order diapers by size (M/G/XG) instead of free-text type ([3f73f7f](https://github.com/alex-bluetrain/mostro/commit/3f73f7f7b23f8062aa8b6b0f13eeed216546b9bf))
* pharmacy reports diaper quantity at confirmation instead of at request ([fb35f2f](https://github.com/alex-bluetrain/mostro/commit/fb35f2fd5b96db9e8c4d32b87ae927037571ac19))
* proof-of-concept for openUI (wip) ([9542f71](https://github.com/alex-bluetrain/mostro/commit/9542f71f0c044e8c02c3eb84c25f967789b56447))
* provision user at telegram invite redeem ([b1851c5](https://github.com/alex-bluetrain/mostro/commit/b1851c5f5067e612f9a95e29606364ddad2d40b4))
* record requester name in diapers workflow state ([b8ce3ff](https://github.com/alex-bluetrain/mostro/commit/b8ce3ff0fa5cde28038fd6472d4df6cb8691c1c9))
* record requester name in meds workflow state ([fad15bb](https://github.com/alex-bluetrain/mostro/commit/fad15bbab895f093d3978d707e0ecfeaccf407fd))
* record requester name in refunds workflow state ([c084869](https://github.com/alex-bluetrain/mostro/commit/c0848694293002d09d0525cf41e4db2ecee29bdd))
* register telegram /start handler for invite redemption ([cd95185](https://github.com/alex-bluetrain/mostro/commit/cd95185bce7106df00f8e95caeaecdc4b2e2a0e2))
* require an identified author to place a diaper order ([0b03fd3](https://github.com/alex-bluetrain/mostro/commit/0b03fd3292522fec0994bcb853787696c953fd4e))
* require an identified author to request a refund ([f8bbef7](https://github.com/alex-bluetrain/mostro/commit/f8bbef74a70a8080ae0fcfda9407753673e60906))
* resolve a user's telegram-bound thread from their canonical email ([9365198](https://github.com/alex-bluetrain/mostro/commit/9365198fb7480a352ab157f1cc0bb0dab64c75af))
* resolve agent memory owner to canonical email on new dm threads ([ce5e18e](https://github.com/alex-bluetrain/mostro/commit/ce5e18ef74f603aac71d609ee087df3421845084))
* return 404/409 from diapers webhook on invalid run state ([b9eaabd](https://github.com/alex-bluetrain/mostro/commit/b9eaabd114082a2b4e014c36ee6b2d23a31bad56))
* return 404/409 from meds webhooks on invalid run state ([62bca4f](https://github.com/alex-bluetrain/mostro/commit/62bca4fdee9d1fef468784b0fea9bda2c306b393))
* return 404/409 from refunds webhooks on invalid run state ([5eb466b](https://github.com/alex-bluetrain/mostro/commit/5eb466bff10cf9e7fda73c24f7e8be9a75b81b75))
* send email through the Gmail API with retries ([acec002](https://github.com/alex-bluetrain/mostro/commit/acec0021e1746aa9fb14e27ae40f492f9ad30db9))
* send invite emails and drop name from invite tool ([a4786e6](https://github.com/alex-bluetrain/mostro/commit/a4786e6d57e2a7af8945cb27d9cda1d74cb42442))
* single-use invites repository with atomic redemption ([c401520](https://github.com/alex-bluetrain/mostro/commit/c40152058d46232b6c5e15445a7a2cb94e7b360a))
* start meds order directly with medications and required author ([2197427](https://github.com/alex-bluetrain/mostro/commit/21974270ff1ca23501be401104ab56f81455fe79))
* stop provisioning users at invite creation ([0b01867](https://github.com/alex-bluetrain/mostro/commit/0b018670c3e1591cdac6a2b3bde7d43838b3615c))
* surface failed runs as an explicit send_failed result ([a4a8589](https://github.com/alex-bluetrain/mostro/commit/a4a85892ba58a5e5c8ba9e24120930dc5e07e616))
* telegram access gate with silent drop and invite deep-link redemption ([c386a66](https://github.com/alex-bluetrain/mostro/commit/c386a6605a470ae4c3f6aa749c200d26bcf8041d))
* tell agents how to handle a failed email send ([675cb6c](https://github.com/alex-bluetrain/mostro/commit/675cb6c86bc66e651c3a9d9112656ffb55a78487))
* users repository backed by mongodb with admin seed ([f015e98](https://github.com/alex-bluetrain/mostro/commit/f015e984a8d9b1f583e0861ad9fec098fff7047c))
* validate deliveryDate and deliveryAddress in diapers confirmation webhook ([1a41da0](https://github.com/alex-bluetrain/mostro/commit/1a41da0ba209052d06213b971be2391d1519b8a0))
* wire telegram gate, admin seed and identity tools into supervisor ([d45e535](https://github.com/alex-bluetrain/mostro/commit/d45e53532e2b51c65f07de0729515e6bf91660ae))


### Bug Fixes

* accept empty resume schemas when the model omits data ([199449b](https://github.com/alex-bluetrain/mostro/commit/199449b9740e6647900964fe7d8e26019eefde19))
* add ngrok on bootstrap (can receive webhooks on local dev) ([bd14bf1](https://github.com/alex-bluetrain/mostro/commit/bd14bf195b9d1279df3763c138043bb80b53451a))
* add refunds agent+workflow ([bd9de82](https://github.com/alex-bluetrain/mostro/commit/bd9de82b48cd763212249b5e015273e7dac87887))
* add supervisor agent ([ed30569](https://github.com/alex-bluetrain/mostro/commit/ed30569cd4228333eaa7006020933b282c7a80e6))
* add timeout and retry to the mailbox reader's Gmail calls ([1b87836](https://github.com/alex-bluetrain/mostro/commit/1b87836724c91e89a15ee1a6f7478ec51e70043a))
* address final review findings for inbox-classifier ([12f1d21](https://github.com/alex-bluetrain/mostro/commit/12f1d214c8082bbf4eb493f0c0e32ece78c7446c))
* agents instructions ([427b3a0](https://github.com/alex-bluetrain/mostro/commit/427b3a07946dd017395540c584e514472cb919b2))
* answer invitee on provisioning failure and close review gaps ([93f0301](https://github.com/alex-bluetrain/mostro/commit/93f03011e49ac32cdbb95db8f805f55af0609c7a))
* catch getAgent() errors inside try block to handle unregistered agent ([6d27cdf](https://github.com/alex-bluetrain/mostro/commit/6d27cdfe4fdbe3c81c1ba745ae0ab2edd5d3b80c))
* close server and log error when OAuth callback lacks authorization code ([7eff21f](https://github.com/alex-bluetrain/mostro/commit/7eff21f84f4d4ff72d3c3e1d5dccb41c7351c519))
* close the notify-mail-failure quote-delimiter escape ([4c55478](https://github.com/alex-bluetrain/mostro/commit/4c55478e15eb0441a4cfc22dd689b89340370a70))
* configure release-please manifest ([947f2ab](https://github.com/alex-bluetrain/mostro/commit/947f2abe36c8f1876182e1d2ef06febd6d99e14f))
* correct diapers diagram payload and translate Gmail README block to English ([6dccc36](https://github.com/alex-bluetrain/mostro/commit/6dccc3672d73d729d4d3f1c1e5b123a0647a4999))
* correct invite model to match real code/expiresAt redeem flow ([dcb0724](https://github.com/alex-bluetrain/mostro/commit/dcb0724a701f09785fdac95ab7dfcb2fa7bd97ef))
* correct invite repository to code-based atomic redeem flow ([5ca327c](https://github.com/alex-bluetrain/mostro/commit/5ca327cdcd0f1d4b76e154e76fe0b2377d3a1699))
* correct subscriber model to match real resourceId/threadId shape ([97b6798](https://github.com/alex-bluetrain/mostro/commit/97b6798bb5aa60ae4b6b2a3c7bf3ad059af40e59))
* correct subscriber repository to add/list by resourceId+threadId ([9cf1e33](https://github.com/alex-bluetrain/mostro/commit/9cf1e3389b33dc8d4ef60795cd3b4531bed5526e))
* fail the deposit webhook when the resumed run fails ([27e5644](https://github.com/alex-bluetrain/mostro/commit/27e5644519f879360745bc396cbf3faf2bf9b086))
* gate mention and subscribed-thread paths, not only DMs ([a09fa98](https://github.com/alex-bluetrain/mostro/commit/a09fa986eb7178f8288c702cc38990a90b486d38))
* gitignore duckdb files ([4fbb4ef](https://github.com/alex-bluetrain/mostro/commit/4fbb4ef7c6a0ed1a07da9821ee793c68bba1d5b8))
* guard all failure paths in notify-mail-failure ([482b161](https://github.com/alex-bluetrain/mostro/commit/482b161bccae4e4ff48ad8045eddc9c8bc5aab27))
* guard extract failures and clarify poll-mailbox invariants ([91fd971](https://github.com/alex-bluetrain/mostro/commit/91fd97157f84a9cdfaf6ecaa9810421279b159a6))
* handle nested multipart emails and prevent concurrent label creation race ([f87f39a](https://github.com/alex-bluetrain/mostro/commit/f87f39ac70a5cf7299c8109a4cf4357c0a07e40b))
* harden the Gmail mailer's encoding declaration and request timeout ([77435a1](https://github.com/alex-bluetrain/mostro/commit/77435a12977d5b09c621cd24014266d5d57fe031))
* keep boot alive when telegram channel init fails ([7eb3ba9](https://github.com/alex-bluetrain/mostro/commit/7eb3ba90ce1a76ba53aca29cba808de7011ec422))
* meds agent (wip) ([4819ebf](https://github.com/alex-bluetrain/mostro/commit/4819ebf5a38cd834bd2cf8e1f131ae8b42846ebd))
* notify steps resolve the telegram-bound thread instead of stored derived ids ([789b840](https://github.com/alex-bluetrain/mostro/commit/789b840be6d4a8232e8d234060982b6c84e99de3))
* patient name, delivery address, etc. as env vars ([2b20875](https://github.com/alex-bluetrain/mostro/commit/2b20875f4776a448676884bdfad6299aa93b3ee4))
* prevent silent data loss for mails older than 30 days during retry ([7890d52](https://github.com/alex-bluetrain/mostro/commit/7890d52974759cf896b4bba6854cf73a9322b770))
* quarantine a resumed mail when marking it processed fails ([5f52e11](https://github.com/alex-bluetrain/mostro/commit/5f52e119bbe7802bdf237d9d04a13d5c4eebd911))
* redirect the OAuth callback to 127.0.0.1, not localhost ([d86499d](https://github.com/alex-bluetrain/mostro/commit/d86499d20ce090981694759fd94c71cf13aaeacd))
* regenerate changelog from full history and drop tag component prefix ([287376b](https://github.com/alex-bluetrain/mostro/commit/287376bb7bdcf429d065c68f8d7d4020ee476fac))
* reject unknown google accounts at sso login and sync name from profile ([33bf3a3](https://github.com/alex-bluetrain/mostro/commit/33bf3a3dd3c4955f332014eb8a4e612d3fccd250))
* remove legacy inbox code, and replace it with new inbox-classifier ([9add5b4](https://github.com/alex-bluetrain/mostro/commit/9add5b4d2fc110b6f16f9c40c15305337d592eb5))
* replace dead /start welcome rule in supervisor instructions ([38b3853](https://github.com/alex-bluetrain/mostro/commit/38b385301d4fe815c6123881a08001c43d9afd1d))
* repoint tests to migrated business module locations, export generateInviteCode ([dc1b5ec](https://github.com/alex-bluetrain/mostro/commit/dc1b5ece3c907ca9de8a1356c754671ced100bac))
* resolve bodyOf search logic and cache rejection handling ([64706f8](https://github.com/alex-bluetrain/mostro/commit/64706f8f796804dc1e2b6f45f79780008cef7239))
* resolve sub-agent resource ids, add identity indexes and gate link warning ([1a0aa8b](https://github.com/alex-bluetrain/mostro/commit/1a0aa8b2af1601a7302f4650727728ef0973597c))
* restrict resume date fields to YYYY-MM-DD ([99dc2eb](https://github.com/alex-bluetrain/mostro/commit/99dc2eb0fec0b1de96b7d29e17f8ec14c61a0a4d))
* sanitize external mail text before it reaches the supervisor prompt ([b08dff9](https://github.com/alex-bluetrain/mostro/commit/b08dff9bac5e1bd4c1c6d6397fe609159c6238a1))
* skip admin seed instead of using placeholder email when ADMIN_EMAIL unset ([b048296](https://github.com/alex-bluetrain/mostro/commit/b0482965b5004677a00b7f6f6eec50f0723fb090))
* stagger the three poll schedules ([af4347a](https://github.com/alex-bluetrain/mostro/commit/af4347af35a7c128aff64c1fd97c3ed6a7fe91d7))
* subscribe tools store the canonical email, not derived sub-agent ids ([553a7d1](https://github.com/alex-bluetrain/mostro/commit/553a7d1a249cb9a84ab6f616f2ae79836b79cde3))
* telegram adapter ([996f41e](https://github.com/alex-bluetrain/mostro/commit/996f41ebb74cf09d133e56522d669c66ecb26f5f))
* telegram adapter in streaming mode (for markdown support) ([07b211f](https://github.com/alex-bluetrain/mostro/commit/07b211fe642090a107eb8480181fd82f14f167b4))
* testing mongodb as storage ([4f1de77](https://github.com/alex-bluetrain/mostro/commit/4f1de7724e30ffbc71c84c1d2707395712226808))
* web wip ([ae0dfe1](https://github.com/alex-bluetrain/mostro/commit/ae0dfe1a542d0442afdfe6dfaafef17841fcd666))
* workflow dates expressed as unix timestamps (easier to query) ([3a60a53](https://github.com/alex-bluetrain/mostro/commit/3a60a536e055e132286e2684331f8761ecbe6d22))
* yearMonth (str) splited into year & month (number) ([01e9496](https://github.com/alex-bluetrain/mostro/commit/01e9496165d231839bdd391d241fdea86aa3d472))


### Reverts

* drop composio email delivery from invites ([d4cce80](https://github.com/alex-bluetrain/mostro/commit/d4cce805e908013732b6b5b466c72665c3cdb453))
