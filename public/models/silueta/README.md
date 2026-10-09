# silueta

U²-Net salient object detection model by Xuebin Qin et al.,
https://github.com/xuebinqin/U-2-Net, released under the Apache License 2.0,
in the reduced 44 MB "silueta" build distributed by rembg
(https://github.com/danielgatis/rembg, MIT).

Split into parts under 20 MB so public CDNs will serve them.
`src/lib/segment.ts` joins them, checks the SHA-256 and runs the model in the
browser to remove busy photo backgrounds. The CDNs load it from the commit that added it (MODEL_COMMIT in segment.ts).
If the model ever changes, give this folder a new name (it is cached as
immutable) and point MODEL_COMMIT at the commit that adds it.
