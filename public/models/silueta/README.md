# silueta

U²-Net salient object detection model by Xuebin Qin et al.,
https://github.com/xuebinqin/U-2-Net, released under the Apache License 2.0,
in the reduced 44 MB "silueta" build distributed by rembg
(https://github.com/danielgatis/rembg, MIT).

Split into parts under 20 MB so public CDNs will serve them.
`src/lib/segment.ts` joins them, checks the SHA-256 and runs the model in the
browser to remove busy photo backgrounds. If the file ever changes, give this
folder a new name: it is cached as immutable.
