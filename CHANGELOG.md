# Changelog

## [1.13.0](https://github.com/alex-bluetrain/mostro-server/compare/v1.12.0...v1.13.0) (2026-09-23)


### Features

* update OpenUI library to react-ui 0.16.2, regenerate system prompt ([#20](https://github.com/alex-bluetrain/mostro-server/issues/20)) ([fef09d5](https://github.com/alex-bluetrain/mostro-server/commit/fef09d52efda3bb1e25551a40decd8d8ea00cf37))

## [1.12.0](https://github.com/alex-bluetrain/mostro-server/compare/v1.11.0...v1.12.0) (2026-09-23)


### Features

* acepta the auth token de Google directo como tercer auth provider ([b6c7449](https://github.com/alex-bluetrain/mostro-server/commit/b6c7449f54db8becc370aaeeca224578319b5213))
* aceptar el a token que firma el the old web client de the old web client en lugar de Google auth ([979c55f](https://github.com/alex-bluetrain/mostro-server/commit/979c55f980354de63ceb85a998cfd1e8129c7645))
* add /start slash-command handler for invite redemption ([c44ad9c](https://github.com/alex-bluetrain/mostro-server/commit/c44ad9c6dd6227c9d812c4fde0f04892e6052497))
* add a one-time script to obtain the Gmail refresh token ([c529279](https://github.com/alex-bluetrain/mostro-server/commit/c5292791fd61f06e5ab98c04c6b1348a6c719946))
* add and register the inbox classifier agent ([250c52e](https://github.com/alex-bluetrain/mostro-server/commit/250c52e25829d8b845fa7f40abffc957ba98a849))
* add composio gmail invite email sender ([85ba478](https://github.com/alex-bluetrain/mostro-server/commit/85ba47898e0411c7d2511b4bbaa528f321e8ba31))
* add dry-run option for poll workflows ([b69bfde](https://github.com/alex-bluetrain/mostro-server/commit/b69bfdeb81e4486e9e565448c2e6c5f7fd2bb2cd))
* add gmail reader for searching and labelling messages ([cbe573e](https://github.com/alex-bluetrain/mostro-server/commit/cbe573e6d24f5792aed10c3aab8531dcda673ddc))
* add identity resolution module ([e252362](https://github.com/alex-bluetrain/mostro-server/commit/e252362152c17e3da602d6329a84b8e8b82199b6))
* add InboxClassifier happy path ([98473a8](https://github.com/alex-bluetrain/mostro-server/commit/98473a87058529cda4467baf17f9491ad22156de))
* add invite mongoose model and schema ([cdad29f](https://github.com/alex-bluetrain/mostro-server/commit/cdad29fb880e2253f8fb94b9bd32b7fcfce37300))
* add invite repository with typed methods ([342d2d9](https://github.com/alex-bluetrain/mostro-server/commit/342d2d9fdcdf1d6ab5e94b17c7bc8461b11356b0))
* add mail extractor agent with a match-or-explain wrapper ([b655675](https://github.com/alex-bluetrain/mostro-server/commit/b6556756ab1ebf90fa077037c13518548f0d8fc0))
* add month helpers for resolving a mail to its order month ([97bfc71](https://github.com/alex-bluetrain/mostro-server/commit/97bfc71fac277ceb4c29ed6bcc66130f4ef7ad2f))
* add outbound email templates for the three domains ([afe7433](https://github.com/alex-bluetrain/mostro-server/commit/afe7433628d36a23eb93c23ee521256b5c27c6e8))
* add redeem-time user provisioning upsert ([ef24f83](https://github.com/alex-bluetrain/mostro-server/commit/ef24f837b15d0b39f6fae75d1f2bc0de7eb4f679))
* add required Gmail settings to the environment schema ([8976ac1](https://github.com/alex-bluetrain/mostro-server/commit/8976ac1892f57cc999d77587c4987dc336a55455))
* add scheduled mailbox pollers for diapers, meds and refunds ([04df109](https://github.com/alex-bluetrain/mostro-server/commit/04df109f504045e827615a78f6b8336addce3ea7))
* add strip-mail-body for the inbox classifier ([9de7de7](https://github.com/alex-bluetrain/mostro-server/commit/9de7de76dd581144e273a5a1c2639886dc522585))
* add subscriber mongoose model and schema ([f897bc9](https://github.com/alex-bluetrain/mostro-server/commit/f897bc98da1a46bf7b66dd998a37d7fb146eb101))
* add subscriber repository with typed methods ([e003b92](https://github.com/alex-bluetrain/mostro-server/commit/e003b9272b0e14eea9a48cd787a461e6b2912ff5))
* add the polling cycle that routes mail by suspended step ([b6ad1ca](https://github.com/alex-bluetrain/mostro-server/commit/b6ad1ca232cc5dd22e022e490f047e402fd7ac0e))
* add user mongoose model and schema ([dfb874e](https://github.com/alex-bluetrain/mostro-server/commit/dfb874e1e61aebaa3da0e540c048a47e6934045e))
* add user repository with typed methods ([cdc29be](https://github.com/alex-bluetrain/mostro-server/commit/cdc29be03466d3e5b6bcfa719178750f34d9a346))
* admin invite tool and set-my-name tool ([26df67d](https://github.com/alex-bluetrain/mostro-server/commit/26df67d331ff37fe89c61ef2e8ddbc6ce878a07d))
* allow extra dev CORS origins via a CORS env var ([2d81fd2](https://github.com/alex-bluetrain/mostro-server/commit/2d81fd2e673aafe6ac53cd8d2b4d6111ba489b4d))
* authorize web login against the users collection ([f8eae3c](https://github.com/alex-bluetrain/mostro-server/commit/f8eae3cb0bd1039a293982d2bb1f4e638c88654b))
* bootstrap automatico de reglas del clasificador desde env ([7f47822](https://github.com/alex-bluetrain/mostro-server/commit/7f4782273939447706d30a5aad314b4f6ccd45f8))
* build RFC 2822 messages for the Gmail API ([9cd0789](https://github.com/alex-bluetrain/mostro-server/commit/9cd07899eb8899c2109097a4181dfe3c97370803))
* canonical user identity keyed by google email with named invites ([108c83a](https://github.com/alex-bluetrain/mostro-server/commit/108c83af55e2b49edb9e2ac51b24120110fec517))
* capacidades dinámicas del supervisor (catálogo de tools + skills) y superficie HTTP para la web ([#12](https://github.com/alex-bluetrain/mostro-server/issues/12)) ([7f6e127](https://github.com/alex-bluetrain/mostro-server/commit/7f6e127431acb5a5b332b8557b6ab0b35bb3cf75))
* capture telegram display name when redeeming an invite ([0413845](https://github.com/alex-bluetrain/mostro-server/commit/04138453eda63a22f697f6809f67b3f096ede286))
* collapse domain sub-agents into single loop (fase 2) ([d8c092d](https://github.com/alex-bluetrain/mostro-server/commit/d8c092d0b61a2794939a047fc202ee44d1928632))
* create business module public API ([a398043](https://github.com/alex-bluetrain/mostro-server/commit/a3980434ae110ac4c587f7df76257621d4772468))
* derive the scoped year-month from a workflow run id ([28c3d41](https://github.com/alex-bluetrain/mostro-server/commit/28c3d414dbe71bba6254679b0761b913bf082df5))
* docker support ([1f2155f](https://github.com/alex-bluetrain/mostro-server/commit/1f2155f88d6c5fcf7d02bbab41f61219e4d0bc25))
* dynamic tool catalog + skills (fase 1) ([fa0f932](https://github.com/alex-bluetrain/mostro-server/commit/fa0f93282467a6e0603988188091ea23339784a6))
* email refund requests and deposit confirmations ([aa7e071](https://github.com/alex-bluetrain/mostro-server/commit/aa7e0717fd963daf6c8d361ea43605bc6cc96b8b))
* email the diaper order to the supplier ([59148de](https://github.com/alex-bluetrain/mostro-server/commit/59148de2a7b598e62d89f77c255a9116a7aa9b17))
* email the medication order to the pharmacy ([f5a415d](https://github.com/alex-bluetrain/mostro-server/commit/f5a415dcc5e1831c4152649c74c3dad246e979d9))
* emitir the UI protocol Lang sólo en el canal web ([b436f00](https://github.com/alex-bluetrain/mostro-server/commit/b436f00d414ec6a91f63d3fe26266c57eb8ae2f3))
* enviar los logs del server a Axiom ([4ef2410](https://github.com/alex-bluetrain/mostro-server/commit/4ef241086793c3161a98254e5c4b20b6ceb4b0be))
* exponer classifier rules por HTTP para la pantalla de admin ([632d8d8](https://github.com/alex-bluetrain/mostro-server/commit/632d8d81efda55ed334153958521c907f05aad87))
* exponer el chat de agentes para la web con thread por canal ([f9f3ac0](https://github.com/alex-bluetrain/mostro-server/commit/f9f3ac0c48616484fc707b39b0c4114aecd9b0c7))
* exponer GET an internal route con el estado de los flows mensuales ([38eeb3b](https://github.com/alex-bluetrain/mostro-server/commit/38eeb3ba9487835af1d45b1f94923ccb9ab50b5d))
* exponer GET an internal route para que el front sepa quién entró ([63272ae](https://github.com/alex-bluetrain/mostro-server/commit/63272ae0eb8599486ac0232ec63138190ceaea02))
* exponer invitaciones por HTTP para la pantalla de admin ([fe3fa7c](https://github.com/alex-bluetrain/mostro-server/commit/fe3fa7c053b53398e10348901062572521253541))
* exponer la ruta the UI protocol para el cliente web ([95188bc](https://github.com/alex-bluetrain/mostro-server/commit/95188bc3c1934dc481cd04d5a94086094ba63d93))
* export repositories from index ([100c930](https://github.com/alex-bluetrain/mostro-server/commit/100c930c3835824323c22a04acabf3b4a3dbe278))
* expose root MIME headers on InboxMessage ([4912dcb](https://github.com/alex-bluetrain/mostro-server/commit/4912dcb3cb529f0c8280b63fe9c554011c6cc67a))
* generalizar el lookup de identidad y el gate por plataforma ([84fa603](https://github.com/alex-bluetrain/mostro-server/commit/84fa603de055830e214e67c47d20117d845f76aa))
* google auth on the mastra server with email allowlist ([0d2e681](https://github.com/alex-bluetrain/mostro-server/commit/0d2e681b40bff098d2756f5453c0ad683a830c22))
* guard diapers confirmation against invalid or non-suspended runs ([b8a6879](https://github.com/alex-bluetrain/mostro-server/commit/b8a687951f4f1c09486c7f8960325eeb681f8c9d))
* guard meds acknowledge and confirmation against invalid or non-suspended runs ([09f2958](https://github.com/alex-bluetrain/mostro-server/commit/09f2958daaedb4e31cd4e3532a2fce2b15ee20f5))
* guard refunds ack, confirmation and deposit against invalid or non-suspended runs ([cbb600a](https://github.com/alex-bluetrain/mostro-server/commit/cbb600a86dec1da1309fbaddb73894c960104aac))
* guide agents to capture the requester name when an order lacks an author ([dde6ff8](https://github.com/alex-bluetrain/mostro-server/commit/dde6ff85033ecf2b4dabd053261e4beaa79417ed))
* improved classifier (KISS principle) and cli for testing it ([bed47b0](https://github.com/alex-bluetrain/mostro-server/commit/bed47b0feb85e7524450c68dcc94765acd223880))
* inbox-manager, mail-classifier, outcome-processor. ([9572497](https://github.com/alex-bluetrain/mostro-server/commit/9572497e0b15c257541b92cae5ee4ce117b9b334))
* initialize mongoose connection in mastra index ([b9116d3](https://github.com/alex-bluetrain/mostro-server/commit/b9116d39b5ae424077c51561361eab1014875c8f))
* inyecta fecha actual en el supervisor y agrega setup docker local ([23a82a5](https://github.com/alex-bluetrain/mostro-server/commit/23a82a58e7abe08ef43ea2d5b39f09c948348993))
* let admins requeue mails that failed to process ([786a450](https://github.com/alex-bluetrain/mostro-server/commit/786a45065a97fa900bce3a55a560ca3510e0ea77))
* **mailer:** log estructurado cuando expira el refresh token de Gmail ([c91c1a7](https://github.com/alex-bluetrain/mostro-server/commit/c91c1a70f7c2eeb447dd1b32e4f71ea8b0ba3732))
* migrate diapers domain to skill + catalog tools (fase 2.2) ([24a8d8d](https://github.com/alex-bluetrain/mostro-server/commit/24a8d8d27013631eaeeeb1cdb4d62853731bf95c))
* migrate meds domain to skill + catalog tools (fase 2.3) ([7376529](https://github.com/alex-bluetrain/mostro-server/commit/7376529eccdb5294e581322eae390b97a854399b))
* migrate refunds domain to skill + catalog tools (fase 2.4) ([a4e3275](https://github.com/alex-bluetrain/mostro-server/commit/a4e32751c97e82a6e7901d9e1a87a9c20a857434))
* migrate weather domain to skill + catalog tool (fase 2.1) ([51579bd](https://github.com/alex-bluetrain/mostro-server/commit/51579bd02d284e0b8d7dbbb350ce76d09c756c46))
* notify domain subscribers when a mail cannot be processed ([003d780](https://github.com/alex-bluetrain/mostro-server/commit/003d780d19ff4c171883ee4d921788c213080769))
* order diapers by size (M/G/XG) instead of free-text type ([231623e](https://github.com/alex-bluetrain/mostro-server/commit/231623ea799a86ccca08385dc0e2ce8570a96ebc))
* pharmacy reports diaper quantity at confirmation instead of at request ([d3f55c2](https://github.com/alex-bluetrain/mostro-server/commit/d3f55c233b94b3ba4025aaa95263818764ea05a9))
* proof-of-concept for openUI (wip) ([ac2584d](https://github.com/alex-bluetrain/mostro-server/commit/ac2584d74b1acd8f908d54f31db5c1c7c64fc731))
* provision user at telegram invite redeem ([6f25b18](https://github.com/alex-bluetrain/mostro-server/commit/6f25b18abdae34363ed7c7d97d864a56bf75d4e3))
* record requester name in diapers workflow state ([645a52f](https://github.com/alex-bluetrain/mostro-server/commit/645a52f63c1281d144b2beff5fb39f45fd8545fd))
* record requester name in meds workflow state ([bc5273a](https://github.com/alex-bluetrain/mostro-server/commit/bc5273aeafdfc133c3724db2dcf60fd8b401cc9f))
* record requester name in refunds workflow state ([21c99f2](https://github.com/alex-bluetrain/mostro-server/commit/21c99f239935c11649820d98e8562c22e87d4230))
* register telegram /start handler for invite redemption ([ba2a4af](https://github.com/alex-bluetrain/mostro-server/commit/ba2a4af2492efe0ee37be656d2be12203e096e59))
* require an identified author to place a diaper order ([6e9a40e](https://github.com/alex-bluetrain/mostro-server/commit/6e9a40e103941c9e871b3481a6d9ca79cf1237e7))
* require an identified author to request a refund ([d694e21](https://github.com/alex-bluetrain/mostro-server/commit/d694e2192b989095fe91f4d46be0e1d9eed96ee8))
* resolve a user's telegram-bound thread from their canonical email ([66609b9](https://github.com/alex-bluetrain/mostro-server/commit/66609b959b2c0febb5bac29cde88b08a1a52e0bd))
* resolve agent memory owner to canonical email on new dm threads ([b5a3885](https://github.com/alex-bluetrain/mostro-server/commit/b5a38858bc63079efa7682fa82a562482b852698))
* return 404/409 from diapers webhook on invalid run state ([6598c9b](https://github.com/alex-bluetrain/mostro-server/commit/6598c9bd5ec7e88533b8191576a2b84b2b02a0a4))
* return 404/409 from meds webhooks on invalid run state ([8d8f5fa](https://github.com/alex-bluetrain/mostro-server/commit/8d8f5fa63b902358206ac18d914bf59a449cc898))
* return 404/409 from refunds webhooks on invalid run state ([4d47e28](https://github.com/alex-bluetrain/mostro-server/commit/4d47e289916033857bc6bfe0c3f48a5d83af70e2))
* seed de runs de workflows para testear reportería web ([4e1e4c4](https://github.com/alex-bluetrain/mostro-server/commit/4e1e4c481adcb36c734f474f6a095d1586769655))
* seed de un año completo por dominio ([e88f549](https://github.com/alex-bluetrain/mostro-server/commit/e88f54921f0425fcc2a45bd86e23273d19ba9a57))
* send email through the Gmail API with retries ([8e606b6](https://github.com/alex-bluetrain/mostro-server/commit/8e606b657d9cafd6991ba5548648994789bc71da))
* send invite emails and drop name from invite tool ([d2e9430](https://github.com/alex-bluetrain/mostro-server/commit/d2e943013af26893da0fb2462a0fa7d6a722c7cc))
* servir a provider desde el server de prod para que el login funcione ([bab11b7](https://github.com/alex-bluetrain/mostro-server/commit/bab11b7ff84fa8eb994e77dc9aa3d2755042d72b))
* SimpleAuth opcional por a provider API key para acceder a a provider en prod ([498cdcd](https://github.com/alex-bluetrain/mostro-server/commit/498cdcd4b61377d41d7204f724e5a6bb2281817d))
* single-use invites repository with atomic redemption ([d179d18](https://github.com/alex-bluetrain/mostro-server/commit/d179d1813a8049ac922bb0a811ed731dd15a8537))
* start meds order directly with medications and required author ([56be495](https://github.com/alex-bluetrain/mostro-server/commit/56be495f346fa22f8fd157fddec4ec915f85ca46))
* stop provisioning users at invite creation ([e34176a](https://github.com/alex-bluetrain/mostro-server/commit/e34176a12a4d4ea965d4924f9d9d95005b62dc99))
* sumar Discord como canal secundario, vinculado desde Telegram ([d6d3d3f](https://github.com/alex-bluetrain/mostro-server/commit/d6d3d3f7bbe6323845112419acea93c178717a17))
* surface failed runs as an explicit send_failed result ([f1d95a4](https://github.com/alex-bluetrain/mostro-server/commit/f1d95a4d8952c989afa09ec32cf46f5624d40751))
* telegram access gate with silent drop and invite deep-link redemption ([556e8b3](https://github.com/alex-bluetrain/mostro-server/commit/556e8b312d8396b01ccb9c9bd6160dc4db26715a))
* tell agents how to handle a failed email send ([0650b5c](https://github.com/alex-bluetrain/mostro-server/commit/0650b5ca47bab3f517bd6bca3ebd1d7a6032b4cc))
* the secret manager integration ([7a49209](https://github.com/alex-bluetrain/mostro-server/commit/7a49209ae95ac7076155de1b97324cd96b63f108))
* timestamps simulados realistas en el seed de runs ([8bdee8f](https://github.com/alex-bluetrain/mostro-server/commit/8bdee8f9838caeaea46526cc07efd841a3853f37))
* users repository backed by mongodb with admin seed ([2604ac0](https://github.com/alex-bluetrain/mostro-server/commit/2604ac03d7dfbcee17e7f6dbeed92236523f3a48))
* validate deliveryDate and deliveryAddress in diapers confirmation webhook ([a34265a](https://github.com/alex-bluetrain/mostro-server/commit/a34265a2deeb028d5a0e121a284797f646373324))
* wire telegram gate, admin seed and identity tools into supervisor ([c71620d](https://github.com/alex-bluetrain/mostro-server/commit/c71620dd6f062e4ae1f8d903bb15c2edc42fe83e))


### Bug Fixes

* accept empty resume schemas when the model omits data ([ad376dd](https://github.com/alex-bluetrain/mostro-server/commit/ad376dddef4edbf25746c617d4e0753bea049fc9))
* add ngrok on bootstrap (can receive webhooks on local dev) ([7c91c49](https://github.com/alex-bluetrain/mostro-server/commit/7c91c49bcc53f8f429e5eb317414ddb18c0fa65c))
* add refunds agent+workflow ([facbb6b](https://github.com/alex-bluetrain/mostro-server/commit/facbb6b7d13380565dc086de143cbe49a32151aa))
* add supervisor agent ([b240b03](https://github.com/alex-bluetrain/mostro-server/commit/b240b0331b924e7d05ccada0a649ac52206e94e2))
* add timeout and retry to the mailbox reader's Gmail calls ([105f544](https://github.com/alex-bluetrain/mostro-server/commit/105f5445d8fd9f976b49771a75f0685e3386604f))
* address final review findings for inbox-classifier ([6c97f1b](https://github.com/alex-bluetrain/mostro-server/commit/6c97f1b2cda546537ec7928fabb37cc76a8fbd98))
* agents instructions ([54b0794](https://github.com/alex-bluetrain/mostro-server/commit/54b079460cb9a30e545279d38a58ae7d66c1268a))
* answer invitee on provisioning failure and close review gaps ([ee8aa8c](https://github.com/alex-bluetrain/mostro-server/commit/ee8aa8c5741c3518d256c6a5e1379708c962b222))
* **auth:** SimpleAuth resuelve el admin por email y puebla el resourceId ([cc78677](https://github.com/alex-bluetrain/mostro-server/commit/cc7867726dce5beafb586a50506317d8cb568f2c))
* catch getAgent() errors inside try block to handle unregistered agent ([9f0465d](https://github.com/alex-bluetrain/mostro-server/commit/9f0465db7289dc1dedbb45b8b87bf51aab9aed50))
* close server and log error when OAuth callback lacks authorization code ([e806ba8](https://github.com/alex-bluetrain/mostro-server/commit/e806ba8275469408918318b08d8d3b3a0091e10a))
* close the notify-mail-failure quote-delimiter escape ([52b55ef](https://github.com/alex-bluetrain/mostro-server/commit/52b55ef3760754971065fae1024c6c22be195cd8))
* configure release-please manifest ([21608ce](https://github.com/alex-bluetrain/mostro-server/commit/21608ced9a09bcea1bda50702385849b5f0bc670))
* correct diapers diagram payload and translate Gmail README block to English ([88e3abf](https://github.com/alex-bluetrain/mostro-server/commit/88e3abfb13213b8881d9e891f030390d065d4a09))
* correct invite model to match real code/expiresAt redeem flow ([5cb146c](https://github.com/alex-bluetrain/mostro-server/commit/5cb146cd54178fe0832642914ced337975f74b4b))
* correct invite repository to code-based atomic redeem flow ([f9d990b](https://github.com/alex-bluetrain/mostro-server/commit/f9d990b1e1b67878089a84cb6bd1f4eb98f5b580))
* correct subscriber model to match real resourceId/threadId shape ([e27f038](https://github.com/alex-bluetrain/mostro-server/commit/e27f03855333185fb66060618543a58b2827e1d8))
* correct subscriber repository to add/list by resourceId+threadId ([9c0acf1](https://github.com/alex-bluetrain/mostro-server/commit/9c0acf14cd65a6e89455b856a1de7ea762a7b40f))
* fail the deposit webhook when the resumed run fails ([5d0a974](https://github.com/alex-bluetrain/mostro-server/commit/5d0a9746ff91487c55baf9991404b87c492ca2f1))
* forbid interstitial text between tool calls on web channel ([912558e](https://github.com/alex-bluetrain/mostro-server/commit/912558ed60c14f690ee53fa3156d78aa4a531de0))
* gate mention and subscribed-thread paths, not only DMs ([edab6a2](https://github.com/alex-bluetrain/mostro-server/commit/edab6a20140310a876336139ee3f74f8d754ad06))
* gitignore duckdb files ([ee706b6](https://github.com/alex-bluetrain/mostro-server/commit/ee706b69e06bf1ae5c8ef8a31010214ab2802578))
* guard all failure paths in notify-mail-failure ([45b8c7b](https://github.com/alex-bluetrain/mostro-server/commit/45b8c7b9562f8eeba362fbef15f66cf1817832ed))
* guard extract failures and clarify poll-mailbox invariants ([c05f89b](https://github.com/alex-bluetrain/mostro-server/commit/c05f89b2aa9f0fa45bc10c7360be0f1ec4f2899f))
* handle nested multipart emails and prevent concurrent label creation race ([aab3962](https://github.com/alex-bluetrain/mostro-server/commit/aab3962d2304326d06ea32822f64bca2d11ea418))
* harden the Gmail mailer's encoding declaration and request timeout ([9b66086](https://github.com/alex-bluetrain/mostro-server/commit/9b66086001549cf46566120f8c5e65e4e9266e4c))
* keep boot alive when telegram channel init fails ([f6b18f5](https://github.com/alex-bluetrain/mostro-server/commit/f6b18f576731316bd6c1ea8c6e4a395bda05b81c))
* keep openui-lang output after reading markdown skills on web ([f849021](https://github.com/alex-bluetrain/mostro-server/commit/f849021b6059a3cc089079550d06668c294224ba))
* meds agent (wip) ([4c7b895](https://github.com/alex-bluetrain/mostro-server/commit/4c7b8956b6d52dfc8bb19ea4afb72d108dd7a4f4))
* NGROK_* should be optional (empty str or undefined) ([19789fb](https://github.com/alex-bluetrain/mostro-server/commit/19789fbfc2854d25a2109bdc6572817230f95851))
* notify steps resolve the telegram-bound thread instead of stored derived ids ([8f863bb](https://github.com/alex-bluetrain/mostro-server/commit/8f863bb4e4ec58df6c0d63ed6a640a3867f9b698))
* patient name, delivery address, etc. as env vars ([c68e2bb](https://github.com/alex-bluetrain/mostro-server/commit/c68e2bbfd1d0395abf6400b140070f2705f8afd6))
* pin @chat-adapter/telegram to 4.38.0 to align chat versions ([93fbc1d](https://github.com/alex-bluetrain/mostro-server/commit/93fbc1d76ad07a10ca4fa72e207697cf6bb2410f))
* prevent silent data loss for mails older than 30 days during retry ([7d49120](https://github.com/alex-bluetrain/mostro-server/commit/7d4912042355d6d39c39f8a941fc40a9584fed6d))
* quarantine a resumed mail when marking it processed fails ([9f8d057](https://github.com/alex-bluetrain/mostro-server/commit/9f8d057574517c9cf607d431c8010db7bd7ddf22))
* redirect the OAuth callback to 127.0.0.1, not localhost ([df34043](https://github.com/alex-bluetrain/mostro-server/commit/df340437669c20fabf6f96424207c2adfb89b557))
* regenerate changelog from full history and drop tag component prefix ([fc104ee](https://github.com/alex-bluetrain/mostro-server/commit/fc104eea292b3a3e208475bbf9d39352077171e0))
* reject unknown google accounts at auth login and sync name from profile ([038a541](https://github.com/alex-bluetrain/mostro-server/commit/038a54145bcfc6706b9de59ec6290f9378f34550))
* remove legacy inbox code, and replace it with new inbox-classifier ([6bf75b3](https://github.com/alex-bluetrain/mostro-server/commit/6bf75b328c67e0248979faff9893a86466a30dd9))
* replace dead /start welcome rule in supervisor instructions ([ad1945b](https://github.com/alex-bluetrain/mostro-server/commit/ad1945b17a0ba5c4b303569ba652bf744a4c2038))
* repoint tests to migrated business module locations, export generateInviteCode ([f93d245](https://github.com/alex-bluetrain/mostro-server/commit/f93d245fc2d468512427fa7d608e8ed262e54923))
* resolve bodyOf search logic and cache rejection handling ([8aa51da](https://github.com/alex-bluetrain/mostro-server/commit/8aa51da09488cf5ad9433d015c546a9012549736))
* resolve sub-agent resource ids, add identity indexes and gate link warning ([43975ee](https://github.com/alex-bluetrain/mostro-server/commit/43975eea0e1edc7f71fe81ce17c04d5f7aca75a0))
* restrict resume date fields to YYYY-MM-DD ([8907025](https://github.com/alex-bluetrain/mostro-server/commit/8907025694adb91a94598dbc1c0ea1f997b36f93))
* saltear el poll si el dominio no tiene reglas en vez de fallar ([e0444d5](https://github.com/alex-bluetrain/mostro-server/commit/e0444d5ca1b4863afb6ae8c8dda3c2e46a17a4ed))
* sanitize external mail text before it reaches the supervisor prompt ([f3d78e1](https://github.com/alex-bluetrain/mostro-server/commit/f3d78e1cfffa17fb70e0fc27ee2dca3d308a2fc3))
* skip admin seed instead of using placeholder email when ADMIN_EMAIL unset ([847fc07](https://github.com/alex-bluetrain/mostro-server/commit/847fc0700c294b63add5c029db8a0e95251584da))
* stagger the three poll schedules ([5294b30](https://github.com/alex-bluetrain/mostro-server/commit/5294b30cb8a116f323e93df59f04a92bf940c283))
* subscribe tools store the canonical email, not derived sub-agent ids ([1c07a4c](https://github.com/alex-bluetrain/mostro-server/commit/1c07a4c05af9d330039f4d4950b0227c72865c6f))
* telegram adapter ([4b026d4](https://github.com/alex-bluetrain/mostro-server/commit/4b026d4baeb8f4ff3efb7d68ef2aaf724d7bae6f))
* telegram adapter in streaming mode (for markdown support) ([69af210](https://github.com/alex-bluetrain/mostro-server/commit/69af210bfc9e3fdc8cf38cc3aad4a055adea2756))
* testing mongodb as storage ([9610353](https://github.com/alex-bluetrain/mostro-server/commit/9610353299a652f6f90e18f3376978083384ff67))
* web wip ([ff9b58b](https://github.com/alex-bluetrain/mostro-server/commit/ff9b58b1cd5e6a93692b7431c1591c0159c0d24e))
* workflow dates expressed as unix timestamps (easier to query) ([6598791](https://github.com/alex-bluetrain/mostro-server/commit/659879126a899023bfb9d680325b1e5d4853d9f3))
* yearMonth (str) splited into year & month (number) ([6b68266](https://github.com/alex-bluetrain/mostro-server/commit/6b682663ed2e18de6db2d046786bbc1efdc53248))


### Reverts

* drop composio email delivery from invites ([5710994](https://github.com/alex-bluetrain/mostro-server/commit/57109942568e4891e1fa0cdf85c8b98dac7fcaeb))

## [1.9.0](https://github.com/alex-bluetrain/mostro-server/compare/v1.8.0...v1.9.0) (2026-09-21)


### Features

* acepta auth token de Google directo como tercer auth provider ([91e4b43](https://github.com/alex-bluetrain/mostro-server/commit/91e4b4304ae479184884d78debf0a0eb0bb7e3e7))
* allow extra dev CORS origins via DEV_CORS_ORIGINS ([bc15cef](https://github.com/alex-bluetrain/mostro-server/commit/bc15cef93d234e8d483712b2a5d0220528cd2023))


### Bug Fixes

* **auth:** SimpleAuth resuelve el admin por email y puebla el resourceId ([157633d](https://github.com/alex-bluetrain/mostro-server/commit/157633d7a3a99e56718129fc0180704fa3e968c9))

## [1.8.0](https://github.com/alex-bluetrain/mostro-server/compare/v1.7.0...v1.8.0) (2026-09-16)


### Features

* capacidades dinámicas del supervisor (catálogo de tools + skills) y superficie HTTP para la web ([#12](https://github.com/alex-bluetrain/mostro-server/issues/12)) ([e0520cd](https://github.com/alex-bluetrain/mostro-server/commit/e0520cdfad1540cf6610ea3f13e4b0b775e166ea))

## [1.7.0](https://github.com/alex-bluetrain/mostro-server/compare/v1.6.0...v1.7.0) (2026-08-18)


### Features

* exponer el chat de agentes para la web con thread por canal ([e10b845](https://github.com/alex-bluetrain/mostro-server/commit/e10b845c3e7c85ce7969975770e800cdc5a5afa1))

## [1.6.0](https://github.com/alex-bluetrain/mostro-server/compare/v1.5.0...v1.6.0) (2026-08-18)


### Features

* aceptar el token del backend anterior en lugar de Google ([ff11663](https://github.com/alex-bluetrain/mostro-server/commit/ff11663992d983dabea104cb80c490e7b5ba6de9))

## [1.5.0](https://github.com/alex-bluetrain/mostro-server/compare/v1.4.1...v1.5.0) (2026-08-17)


### Features

* enviar los logs del server a Axiom ([ec5cde9](https://github.com/alex-bluetrain/mostro-server/commit/ec5cde972d022c62120bee081593dcdaac01d963))

## [1.4.1](https://github.com/alex-bluetrain/mostro-server/compare/v1.4.0...v1.4.1) (2026-08-17)


### Bug Fixes

* saltear el poll si el dominio no tiene reglas en vez de fallar ([f623e37](https://github.com/alex-bluetrain/mostro-server/commit/f623e37603858532859931f9b9c02aae88db0682))

## [1.4.0](https://github.com/alex-bluetrain/mostro-server/compare/v1.3.0...v1.4.0) (2026-08-17)


### Features

* bootstrap automatico de reglas del clasificador desde env ([55b0180](https://github.com/alex-bluetrain/mostro-server/commit/55b01809b6cf0c46461d948e59eef62556596345))

## [1.3.0](https://github.com/alex-bluetrain/mostro-server/compare/v1.2.0...v1.3.0) (2026-08-17)


### Features

* servir Studio desde el server de prod para que el login funcione ([8c192af](https://github.com/alex-bluetrain/mostro-server/commit/8c192af41a7e573494e29b8e36491f53b107ad42))

## [1.2.0](https://github.com/alex-bluetrain/mostro-server/compare/v1.1.1...v1.2.0) (2026-08-16)


### Features

* SimpleAuth opcional por STUDIO_API_KEY para acceder a Studio en prod ([c69441d](https://github.com/alex-bluetrain/mostro-server/commit/c69441dff9cd32f94cdbcc84044b6f0807a75b72))

## [1.1.1](https://github.com/alex-bluetrain/mostro-server/compare/v1.1.0...v1.1.1) (2026-08-16)


### Bug Fixes

* NGROK_* should be optional (empty str or undefined) ([b64e942](https://github.com/alex-bluetrain/mostro-server/commit/b64e942954345b9f7b7d52cd5ad16c9a904f15e7))

## [1.1.0](https://github.com/alex-bluetrain/mostro-server/compare/v1.0.0...v1.1.0) (2026-08-16)


### Features

* add /start slash-command handler for invite redemption ([e8f0d69](https://github.com/alex-bluetrain/mostro-server/commit/e8f0d69521ff6b7c87224708841cb58aa3546d37))
* add a one-time script to obtain the Gmail refresh token ([92fabd1](https://github.com/alex-bluetrain/mostro-server/commit/92fabd1d61776169f535769a5f7a646d203327b3))
* add and register the inbox classifier agent ([d8e7cb4](https://github.com/alex-bluetrain/mostro-server/commit/d8e7cb4bdac1043e9a01b213249f9597cdc5ef0e))
* add composio gmail invite email sender ([c9f490b](https://github.com/alex-bluetrain/mostro-server/commit/c9f490b429ac84b8f6b6fc1de45dc390c5a53e28))
* add dry-run option for poll workflows ([6d033ef](https://github.com/alex-bluetrain/mostro-server/commit/6d033ef7748fea153284356b5f3d9efcb934f14d))
* add gmail reader for searching and labelling messages ([17a778e](https://github.com/alex-bluetrain/mostro-server/commit/17a778e5520159ea53aea85d7f0496f96bd53617))
* add identity resolution module ([030a7a9](https://github.com/alex-bluetrain/mostro-server/commit/030a7a9e18e47536a88c7c210f6eded347a9379b))
* add InboxClassifier happy path ([915259b](https://github.com/alex-bluetrain/mostro-server/commit/915259b93ee298c4fe3a84a4e87114db9ac91383))
* add invite mongoose model and schema ([c1cb519](https://github.com/alex-bluetrain/mostro-server/commit/c1cb519492f93c1256e15e400158da8f1503fa70))
* add invite repository with typed methods ([05fd99e](https://github.com/alex-bluetrain/mostro-server/commit/05fd99eb8c796de9ba40e45d42b2a965a89bf979))
* add mail extractor agent with a match-or-explain wrapper ([0bcea95](https://github.com/alex-bluetrain/mostro-server/commit/0bcea9578c561d6947bd877833ca23ae10e857db))
* add month helpers for resolving a mail to its order month ([217249b](https://github.com/alex-bluetrain/mostro-server/commit/217249be3edc358a4d27c9213a2700ecdb7f7c8a))
* add outbound email templates for the three domains ([f6c70b3](https://github.com/alex-bluetrain/mostro-server/commit/f6c70b3ec5fdfb8737657482cffe5484687e1a24))
* add redeem-time user provisioning upsert ([7480528](https://github.com/alex-bluetrain/mostro-server/commit/7480528591b8574e2d0d8f025d7b462f6ce1a394))
* add required Gmail settings to the environment schema ([6782aec](https://github.com/alex-bluetrain/mostro-server/commit/6782aec81ddc8c18d607a0ddd62972966dea31c6))
* add scheduled mailbox pollers for diapers, meds and refunds ([4d0684b](https://github.com/alex-bluetrain/mostro-server/commit/4d0684b01113e4781380d9ba7f1b6b7e6979fb7b))
* add strip-mail-body for the inbox classifier ([dd77742](https://github.com/alex-bluetrain/mostro-server/commit/dd77742aa74880e6b61bc626c5011a5e7ea2cc6e))
* add subscriber mongoose model and schema ([2797b19](https://github.com/alex-bluetrain/mostro-server/commit/2797b196c28fcd028111a4f55f9a1d2fa865cc66))
* add subscriber repository with typed methods ([39b9f66](https://github.com/alex-bluetrain/mostro-server/commit/39b9f66a590b7b0acf1b75f1aca6803075c2fc41))
* add the polling cycle that routes mail by suspended step ([3684fb6](https://github.com/alex-bluetrain/mostro-server/commit/3684fb6088a74f4b80488a0c1cc71cd33638b205))
* add user mongoose model and schema ([e2b388a](https://github.com/alex-bluetrain/mostro-server/commit/e2b388acaa5d5d37e75bfc16e866809548d5cffd))
* add user repository with typed methods ([9774919](https://github.com/alex-bluetrain/mostro-server/commit/9774919f1dd4da3cbabc416c0e1fd3e26874a431))
* admin invite tool and set-my-name tool ([7652b70](https://github.com/alex-bluetrain/mostro-server/commit/7652b7090dc0a77c8ff228a49d4441f479cf0b9b))
* authorize web login against the users collection ([4126e03](https://github.com/alex-bluetrain/mostro-server/commit/4126e03c2689d3531e395862cc1e87490005f9d5))
* build RFC 2822 messages for the Gmail API ([46f7a73](https://github.com/alex-bluetrain/mostro-server/commit/46f7a73860d6ed9163a74c9b03b8de3af50aca61))
* canonical user identity keyed by google email with named invites ([e1800dd](https://github.com/alex-bluetrain/mostro-server/commit/e1800dd4b9f6288d4ff486dae380cbedb6aa7bc0))
* capture telegram display name when redeeming an invite ([63d60f2](https://github.com/alex-bluetrain/mostro-server/commit/63d60f29fe18848fc54d89d9f1a8b06b73b863c6))
* create business module public API ([5e135d5](https://github.com/alex-bluetrain/mostro-server/commit/5e135d59cd4967888d2dbd2ea6529d849aea8432))
* derive the scoped year-month from a workflow run id ([1f9c005](https://github.com/alex-bluetrain/mostro-server/commit/1f9c0054bc7a01e6ca500b76b463d5fe5ac262e4))
* docker support ([e082b98](https://github.com/alex-bluetrain/mostro-server/commit/e082b98362ab42546bc691721a9f8d4fe91aefa8))
* email refund requests and deposit confirmations ([1b061c1](https://github.com/alex-bluetrain/mostro-server/commit/1b061c1f80ad5ff106d13d742b9c06d2dd1ba972))
* email the diaper order to the supplier ([2c14a5f](https://github.com/alex-bluetrain/mostro-server/commit/2c14a5ff8c3a7da23fabc23f72b6dee369feb9ff))
* email the medication order to the pharmacy ([882490b](https://github.com/alex-bluetrain/mostro-server/commit/882490bdc95ba3ffe40f1a270246a7d8101dd3d1))
* export repositories from index ([02df364](https://github.com/alex-bluetrain/mostro-server/commit/02df36487bf0b5f0574e4a706c37663ceb4d21b4))
* expose root MIME headers on InboxMessage ([4b0f6e8](https://github.com/alex-bluetrain/mostro-server/commit/4b0f6e87e74dc158478ab5a6c359656d9f2e356d))
* google auth on the mastra server with email allowlist ([245a8c8](https://github.com/alex-bluetrain/mostro-server/commit/245a8c8486b4bc5d9c94c32b2fa34bfbeb265c7a))
* guard diapers confirmation against invalid or non-suspended runs ([adddfd2](https://github.com/alex-bluetrain/mostro-server/commit/adddfd29eb06bfe6fb8df3582a69cfff794081d3))
* guard meds acknowledge and confirmation against invalid or non-suspended runs ([dc19748](https://github.com/alex-bluetrain/mostro-server/commit/dc1974812b82ae508bf63619bf87689f2ad26711))
* guard refunds ack, confirmation and deposit against invalid or non-suspended runs ([068037f](https://github.com/alex-bluetrain/mostro-server/commit/068037f5d3b36f015417b16b4422ec4e2effca74))
* guide agents to capture the requester name when an order lacks an author ([80abe96](https://github.com/alex-bluetrain/mostro-server/commit/80abe960efcd29958d2407c26f48524299d20f76))
* improved classifier (KISS principle) and cli for testing it ([dab3c6a](https://github.com/alex-bluetrain/mostro-server/commit/dab3c6a7178dea8803dc11e77f2520fb33913cb7))
* inbox-manager, mail-classifier, outcome-processor. ([e787dc4](https://github.com/alex-bluetrain/mostro-server/commit/e787dc4b1632a5ac25013ba0dc58ae9108ef2b29))
* infisical integration ([8dcb044](https://github.com/alex-bluetrain/mostro-server/commit/8dcb044319640656ddb701f8bef2bc5e1fa17af0))
* initialize mongoose connection in mastra index ([0e9c095](https://github.com/alex-bluetrain/mostro-server/commit/0e9c095df849e4a3d5f22556559749a80b04ccae))
* let admins requeue mails that failed to process ([6247383](https://github.com/alex-bluetrain/mostro-server/commit/62473831238d70a1d7e4e9514fe97cedba03bde9))
* notify domain subscribers when a mail cannot be processed ([0e96dba](https://github.com/alex-bluetrain/mostro-server/commit/0e96dba6c98067aa9ec642ce313b0b128353912b))
* order diapers by size (M/G/XG) instead of free-text type ([3f73f7f](https://github.com/alex-bluetrain/mostro-server/commit/3f73f7f7b23f8062aa8b6b0f13eeed216546b9bf))
* pharmacy reports diaper quantity at confirmation instead of at request ([fb35f2f](https://github.com/alex-bluetrain/mostro-server/commit/fb35f2fd5b96db9e8c4d32b87ae927037571ac19))
* proof-of-concept for openUI (wip) ([9542f71](https://github.com/alex-bluetrain/mostro-server/commit/9542f71f0c044e8c02c3eb84c25f967789b56447))
* provision user at telegram invite redeem ([b1851c5](https://github.com/alex-bluetrain/mostro-server/commit/b1851c5f5067e612f9a95e29606364ddad2d40b4))
* record requester name in diapers workflow state ([b8ce3ff](https://github.com/alex-bluetrain/mostro-server/commit/b8ce3ff0fa5cde28038fd6472d4df6cb8691c1c9))
* record requester name in meds workflow state ([fad15bb](https://github.com/alex-bluetrain/mostro-server/commit/fad15bbab895f093d3978d707e0ecfeaccf407fd))
* record requester name in refunds workflow state ([c084869](https://github.com/alex-bluetrain/mostro-server/commit/c0848694293002d09d0525cf41e4db2ecee29bdd))
* register telegram /start handler for invite redemption ([cd95185](https://github.com/alex-bluetrain/mostro-server/commit/cd95185bce7106df00f8e95caeaecdc4b2e2a0e2))
* require an identified author to place a diaper order ([0b03fd3](https://github.com/alex-bluetrain/mostro-server/commit/0b03fd3292522fec0994bcb853787696c953fd4e))
* require an identified author to request a refund ([f8bbef7](https://github.com/alex-bluetrain/mostro-server/commit/f8bbef74a70a8080ae0fcfda9407753673e60906))
* resolve a user's telegram-bound thread from their canonical email ([9365198](https://github.com/alex-bluetrain/mostro-server/commit/9365198fb7480a352ab157f1cc0bb0dab64c75af))
* resolve agent memory owner to canonical email on new dm threads ([ce5e18e](https://github.com/alex-bluetrain/mostro-server/commit/ce5e18ef74f603aac71d609ee087df3421845084))
* return 404/409 from diapers webhook on invalid run state ([b9eaabd](https://github.com/alex-bluetrain/mostro-server/commit/b9eaabd114082a2b4e014c36ee6b2d23a31bad56))
* return 404/409 from meds webhooks on invalid run state ([62bca4f](https://github.com/alex-bluetrain/mostro-server/commit/62bca4fdee9d1fef468784b0fea9bda2c306b393))
* return 404/409 from refunds webhooks on invalid run state ([5eb466b](https://github.com/alex-bluetrain/mostro-server/commit/5eb466bff10cf9e7fda73c24f7e8be9a75b81b75))
* send email through the Gmail API with retries ([acec002](https://github.com/alex-bluetrain/mostro-server/commit/acec0021e1746aa9fb14e27ae40f492f9ad30db9))
* send invite emails and drop name from invite tool ([a4786e6](https://github.com/alex-bluetrain/mostro-server/commit/a4786e6d57e2a7af8945cb27d9cda1d74cb42442))
* single-use invites repository with atomic redemption ([c401520](https://github.com/alex-bluetrain/mostro-server/commit/c40152058d46232b6c5e15445a7a2cb94e7b360a))
* start meds order directly with medications and required author ([2197427](https://github.com/alex-bluetrain/mostro-server/commit/21974270ff1ca23501be401104ab56f81455fe79))
* stop provisioning users at invite creation ([0b01867](https://github.com/alex-bluetrain/mostro-server/commit/0b018670c3e1591cdac6a2b3bde7d43838b3615c))
* surface failed runs as an explicit send_failed result ([a4a8589](https://github.com/alex-bluetrain/mostro-server/commit/a4a85892ba58a5e5c8ba9e24120930dc5e07e616))
* telegram access gate with silent drop and invite deep-link redemption ([c386a66](https://github.com/alex-bluetrain/mostro-server/commit/c386a6605a470ae4c3f6aa749c200d26bcf8041d))
* tell agents how to handle a failed email send ([675cb6c](https://github.com/alex-bluetrain/mostro-server/commit/675cb6c86bc66e651c3a9d9112656ffb55a78487))
* users repository backed by mongodb with admin seed ([f015e98](https://github.com/alex-bluetrain/mostro-server/commit/f015e984a8d9b1f583e0861ad9fec098fff7047c))
* validate deliveryDate and deliveryAddress in diapers confirmation webhook ([1a41da0](https://github.com/alex-bluetrain/mostro-server/commit/1a41da0ba209052d06213b971be2391d1519b8a0))
* wire telegram gate, admin seed and identity tools into supervisor ([d45e535](https://github.com/alex-bluetrain/mostro-server/commit/d45e53532e2b51c65f07de0729515e6bf91660ae))


### Bug Fixes

* accept empty resume schemas when the model omits data ([199449b](https://github.com/alex-bluetrain/mostro-server/commit/199449b9740e6647900964fe7d8e26019eefde19))
* add ngrok on bootstrap (can receive webhooks on local dev) ([bd14bf1](https://github.com/alex-bluetrain/mostro-server/commit/bd14bf195b9d1279df3763c138043bb80b53451a))
* add refunds agent+workflow ([bd9de82](https://github.com/alex-bluetrain/mostro-server/commit/bd9de82b48cd763212249b5e015273e7dac87887))
* add supervisor agent ([ed30569](https://github.com/alex-bluetrain/mostro-server/commit/ed30569cd4228333eaa7006020933b282c7a80e6))
* add timeout and retry to the mailbox reader's Gmail calls ([1b87836](https://github.com/alex-bluetrain/mostro-server/commit/1b87836724c91e89a15ee1a6f7478ec51e70043a))
* address final review findings for inbox-classifier ([12f1d21](https://github.com/alex-bluetrain/mostro-server/commit/12f1d214c8082bbf4eb493f0c0e32ece78c7446c))
* agents instructions ([427b3a0](https://github.com/alex-bluetrain/mostro-server/commit/427b3a07946dd017395540c584e514472cb919b2))
* answer invitee on provisioning failure and close review gaps ([93f0301](https://github.com/alex-bluetrain/mostro-server/commit/93f03011e49ac32cdbb95db8f805f55af0609c7a))
* catch getAgent() errors inside try block to handle unregistered agent ([6d27cdf](https://github.com/alex-bluetrain/mostro-server/commit/6d27cdfe4fdbe3c81c1ba745ae0ab2edd5d3b80c))
* close server and log error when OAuth callback lacks authorization code ([7eff21f](https://github.com/alex-bluetrain/mostro-server/commit/7eff21f84f4d4ff72d3c3e1d5dccb41c7351c519))
* close the notify-mail-failure quote-delimiter escape ([4c55478](https://github.com/alex-bluetrain/mostro-server/commit/4c55478e15eb0441a4cfc22dd689b89340370a70))
* configure release-please manifest ([947f2ab](https://github.com/alex-bluetrain/mostro-server/commit/947f2abe36c8f1876182e1d2ef06febd6d99e14f))
* correct diapers diagram payload and translate Gmail README block to English ([6dccc36](https://github.com/alex-bluetrain/mostro-server/commit/6dccc3672d73d729d4d3f1c1e5b123a0647a4999))
* correct invite model to match real code/expiresAt redeem flow ([dcb0724](https://github.com/alex-bluetrain/mostro-server/commit/dcb0724a701f09785fdac95ab7dfcb2fa7bd97ef))
* correct invite repository to code-based atomic redeem flow ([5ca327c](https://github.com/alex-bluetrain/mostro-server/commit/5ca327cdcd0f1d4b76e154e76fe0b2377d3a1699))
* correct subscriber model to match real resourceId/threadId shape ([97b6798](https://github.com/alex-bluetrain/mostro-server/commit/97b6798bb5aa60ae4b6b2a3c7bf3ad059af40e59))
* correct subscriber repository to add/list by resourceId+threadId ([9cf1e33](https://github.com/alex-bluetrain/mostro-server/commit/9cf1e3389b33dc8d4ef60795cd3b4531bed5526e))
* fail the deposit webhook when the resumed run fails ([27e5644](https://github.com/alex-bluetrain/mostro-server/commit/27e5644519f879360745bc396cbf3faf2bf9b086))
* gate mention and subscribed-thread paths, not only DMs ([a09fa98](https://github.com/alex-bluetrain/mostro-server/commit/a09fa986eb7178f8288c702cc38990a90b486d38))
* gitignore duckdb files ([4fbb4ef](https://github.com/alex-bluetrain/mostro-server/commit/4fbb4ef7c6a0ed1a07da9821ee793c68bba1d5b8))
* guard all failure paths in notify-mail-failure ([482b161](https://github.com/alex-bluetrain/mostro-server/commit/482b161bccae4e4ff48ad8045eddc9c8bc5aab27))
* guard extract failures and clarify poll-mailbox invariants ([91fd971](https://github.com/alex-bluetrain/mostro-server/commit/91fd97157f84a9cdfaf6ecaa9810421279b159a6))
* handle nested multipart emails and prevent concurrent label creation race ([f87f39a](https://github.com/alex-bluetrain/mostro-server/commit/f87f39ac70a5cf7299c8109a4cf4357c0a07e40b))
* harden the Gmail mailer's encoding declaration and request timeout ([77435a1](https://github.com/alex-bluetrain/mostro-server/commit/77435a12977d5b09c621cd24014266d5d57fe031))
* keep boot alive when telegram channel init fails ([7eb3ba9](https://github.com/alex-bluetrain/mostro-server/commit/7eb3ba90ce1a76ba53aca29cba808de7011ec422))
* meds agent (wip) ([4819ebf](https://github.com/alex-bluetrain/mostro-server/commit/4819ebf5a38cd834bd2cf8e1f131ae8b42846ebd))
* notify steps resolve the telegram-bound thread instead of stored derived ids ([789b840](https://github.com/alex-bluetrain/mostro-server/commit/789b840be6d4a8232e8d234060982b6c84e99de3))
* patient name, delivery address, etc. as env vars ([2b20875](https://github.com/alex-bluetrain/mostro-server/commit/2b20875f4776a448676884bdfad6299aa93b3ee4))
* prevent silent data loss for mails older than 30 days during retry ([7890d52](https://github.com/alex-bluetrain/mostro-server/commit/7890d52974759cf896b4bba6854cf73a9322b770))
* quarantine a resumed mail when marking it processed fails ([5f52e11](https://github.com/alex-bluetrain/mostro-server/commit/5f52e119bbe7802bdf237d9d04a13d5c4eebd911))
* redirect the OAuth callback to 127.0.0.1, not localhost ([d86499d](https://github.com/alex-bluetrain/mostro-server/commit/d86499d20ce090981694759fd94c71cf13aaeacd))
* regenerate changelog from full history and drop tag component prefix ([287376b](https://github.com/alex-bluetrain/mostro-server/commit/287376bb7bdcf429d065c68f8d7d4020ee476fac))
* reject unknown google accounts at login and sync name from profile ([33bf3a3](https://github.com/alex-bluetrain/mostro-server/commit/33bf3a3dd3c4955f332014eb8a4e612d3fccd250))
* remove legacy inbox code, and replace it with new inbox-classifier ([9add5b4](https://github.com/alex-bluetrain/mostro-server/commit/9add5b4d2fc110b6f16f9c40c15305337d592eb5))
* replace dead /start welcome rule in supervisor instructions ([38b3853](https://github.com/alex-bluetrain/mostro-server/commit/38b385301d4fe815c6123881a08001c43d9afd1d))
* repoint tests to migrated business module locations, export generateInviteCode ([dc1b5ec](https://github.com/alex-bluetrain/mostro-server/commit/dc1b5ece3c907ca9de8a1356c754671ced100bac))
* resolve bodyOf search logic and cache rejection handling ([64706f8](https://github.com/alex-bluetrain/mostro-server/commit/64706f8f796804dc1e2b6f45f79780008cef7239))
* resolve sub-agent resource ids, add identity indexes and gate link warning ([1a0aa8b](https://github.com/alex-bluetrain/mostro-server/commit/1a0aa8b2af1601a7302f4650727728ef0973597c))
* restrict resume date fields to YYYY-MM-DD ([99dc2eb](https://github.com/alex-bluetrain/mostro-server/commit/99dc2eb0fec0b1de96b7d29e17f8ec14c61a0a4d))
* sanitize external mail text before it reaches the supervisor prompt ([b08dff9](https://github.com/alex-bluetrain/mostro-server/commit/b08dff9bac5e1bd4c1c6d6397fe609159c6238a1))
* skip admin seed instead of using placeholder email when ADMIN_EMAIL unset ([b048296](https://github.com/alex-bluetrain/mostro-server/commit/b0482965b5004677a00b7f6f6eec50f0723fb090))
* stagger the three poll schedules ([af4347a](https://github.com/alex-bluetrain/mostro-server/commit/af4347af35a7c128aff64c1fd97c3ed6a7fe91d7))
* subscribe tools store the canonical email, not derived sub-agent ids ([553a7d1](https://github.com/alex-bluetrain/mostro-server/commit/553a7d1a249cb9a84ab6f616f2ae79836b79cde3))
* telegram adapter ([996f41e](https://github.com/alex-bluetrain/mostro-server/commit/996f41ebb74cf09d133e56522d669c66ecb26f5f))
* telegram adapter in streaming mode (for markdown support) ([07b211f](https://github.com/alex-bluetrain/mostro-server/commit/07b211fe642090a107eb8480181fd82f14f167b4))
* testing mongodb as storage ([4f1de77](https://github.com/alex-bluetrain/mostro-server/commit/4f1de7724e30ffbc71c84c1d2707395712226808))
* web wip ([ae0dfe1](https://github.com/alex-bluetrain/mostro-server/commit/ae0dfe1a542d0442afdfe6dfaafef17841fcd666))
* workflow dates expressed as unix timestamps (easier to query) ([3a60a53](https://github.com/alex-bluetrain/mostro-server/commit/3a60a536e055e132286e2684331f8761ecbe6d22))
* yearMonth (str) splited into year & month (number) ([01e9496](https://github.com/alex-bluetrain/mostro-server/commit/01e9496165d231839bdd391d241fdea86aa3d472))


### Reverts

* drop composio email delivery from invites ([d4cce80](https://github.com/alex-bluetrain/mostro-server/commit/d4cce805e908013732b6b5b466c72665c3cdb453))
