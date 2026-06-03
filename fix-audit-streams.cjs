const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'context', 'audit-signaling-context.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. startMeshView (ice-candidate and offer)
content = content.replace(
  /pc\.onicecandidate = \(iceEvent\) => \{\s*if \(\!iceEvent\.candidate\) return;\s*send\(\{\s*type: "ice-candidate",\s*targetSocketId: clientSocketId,\s*streamKey: viewKey,\s*candidate: iceEvent\.candidate\.toJSON\(\),\s*\}\);\s*\};\s*try \{\s*const offer = await pc\.createOffer\(\);\s*await pc\.setLocalDescription\(offer\);\s*const pref = viewKey \? prefsRef\.current\.get\(viewKey\) : undefined;\s*send\(\{\s*type: "offer",\s*targetSocketId: clientSocketId,\s*streamKey: viewKey,\s*sdp: offer,/g,
  `pc.onicecandidate = (iceEvent) => {
        if (!iceEvent.candidate) return;
        const sid = activeSessionIdByViewKeyRef.current.get(viewKey);
        send({
          type: "ice-candidate",
          targetSocketId: clientSocketId,
          streamKey: viewKey,
          ...(sid ? { sessionId: sid } : {}),
          candidate: iceEvent.candidate.toJSON(),
        });
      };
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const pref = viewKey ? prefsRef.current.get(viewKey) : undefined;
        const sid = activeSessionIdByViewKeyRef.current.get(viewKey);
        send({
          type: "offer",
          targetSocketId: clientSocketId,
          streamKey: viewKey,
          ...(sid ? { sessionId: sid } : {}),
          sdp: offer,`
);

// 2. start-offer
content = content.replace(
  /if \(pending\?\.length\) \{\s*viewKey = pending\.shift\(\)!\;\s*if \(\!pending\.length\) pendingViewKeyByClientRef\.current\.delete\(clientId\);\s*else pendingViewKeyByClientRef\.current\.set\(clientId, pending\);\s*\}\s*clearConnectRetry\(viewKey\);\s*connectCooldownByClientRef\.current\.delete\(clientId\);\s*armStreamConnectTimeout\(viewKey\);\s*clientSocketByViewKeyRef\.current\.set\(viewKey, clientSocketId\);\s*\}/g,
  `if (pending?.length) {
              viewKey = pending.shift()!;
              if (!pending.length) pendingViewKeyByClientRef.current.delete(clientId);
              else pendingViewKeyByClientRef.current.set(clientId, pending);
            }
            
            const msgSid = Number(msg.sessionId);
            if (Number.isFinite(msgSid) && msgSid > 0) {
              const currentSid = activeSessionIdByViewKeyRef.current.get(viewKey) ?? 0;
              if (msgSid < currentSid) {
                console.warn("[audit] Dropping stale start-offer for", viewKey, "sessionId", msgSid);
                break;
              }
              activeSessionIdByViewKeyRef.current.set(viewKey, msgSid);
            }

            clearConnectRetry(viewKey);
            connectCooldownByClientRef.current.delete(clientId);
            armStreamConnectTimeout(viewKey);
            clientSocketByViewKeyRef.current.set(viewKey, clientSocketId);
          }`
);

// 3. answer
content = content.replace(
  /case "answer": \{\s*const sdp = msg\.sdp as RTCSessionDescriptionInit \| undefined;\s*const vk = streamSignalingKey\(msg\) \?\? "";\s*const pc = vk \? pcByViewKeyRef\.current\.get\(vk\) : null;\s*if \(pc && sdp\) \{/g,
  `case "answer": {
          const sdp = msg.sdp as RTCSessionDescriptionInit | undefined;
          const vk = streamSignalingKey(msg) ?? "";
          
          if (vk) {
            const msgSid = Number(msg.sessionId);
            if (Number.isFinite(msgSid) && msgSid > 0) {
              const currentSid = activeSessionIdByViewKeyRef.current.get(vk) ?? 0;
              if (msgSid !== currentSid) {
                console.warn(\`[audit] Dropping stale answer for \${vk}, sessionId: \${msgSid} != \${currentSid}\`);
                break;
              }
            }
          }

          const pc = vk ? pcByViewKeyRef.current.get(vk) : null;
          if (pc && sdp) {`
);

// 4. ice-candidate
content = content.replace(
  /case "ice-candidate": \{\s*const candidate = msg\.candidate as RTCIceCandidateInit \| undefined;\s*const vk = streamSignalingKey\(msg\) \?\? "";\s*const pc = vk \? pcByViewKeyRef\.current\.get\(vk\) : null;\s*if \(\!pc \|\| \!candidate\?\.candidate \|\| \!vk\) break;/g,
  `case "ice-candidate": {
          const candidate = msg.candidate as RTCIceCandidateInit | undefined;
          const vk = streamSignalingKey(msg) ?? "";
          
          if (vk) {
            const msgSid = Number(msg.sessionId);
            if (Number.isFinite(msgSid) && msgSid > 0) {
              const currentSid = activeSessionIdByViewKeyRef.current.get(vk) ?? 0;
              if (msgSid !== currentSid) {
                console.warn(\`[audit] Dropping stale ice-candidate for \${vk}, sessionId: \${msgSid} != \${currentSid}\`);
                break;
              }
            }
          }

          const pc = vk ? pcByViewKeyRef.current.get(vk) : null;
          if (!pc || !candidate?.candidate || !vk) break;`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Update complete for audit-signaling-context.tsx with regex replacements.');
