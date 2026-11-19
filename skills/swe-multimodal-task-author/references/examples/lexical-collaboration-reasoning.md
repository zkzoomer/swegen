# What this task requires

When a block in a collaboratively edited Lexical document is reordered, concurrent edits made by a different user to blocks that only shift position are lost. A working fix has to keep the collaborative identity of the blocks that only shifted, instead of recreating them, so the edits made by the other user are not lost.

# Why it is non-trivial

Fixing this issue involves changes in three different, but connected, areas of the two involved packages. The binding layer cannot distinguish if a block has been moved explicitly, so the core editor has to take a "move hint" first. Simply reusing collaborative nodes fails, so the binding has to pair the move hints with longest increasing subsequence diffing in order to not touch other nodes.

# Why the media is necessary

The instructions don't provide a document or other info and the bug involves timing edits across two windows. This means a single frame cannot replicate it. Solvers must watch the video to see the block being dragged and identify which paragraph loses its text.

# The change

The core editor now keeps track of explicit node moves during transactions and passes move hints to the Yjs binding. Because of this, `syncChildrenFromLexical` in `CollabElementNode` no longer recreates all child nodes and only creates child nodes of moved nodes. Because Yjs doesn't have a native move operation, changes made to a block that's being dragged are still lost. This is expected behavior.

# Tests

The 19 failure to pass tests (in `sequoia_concurrent_move.test.ts`) spawn two-client sessions, perform concurrent edits on different paragraphs, reorder blocks, and check that all un-moved blocks retain their text on both clients. Eight reorder top-level paragraphs (single moves, two concurrent edits, a multi-block move and two range cut/pastes, one moving five of seven lines); three repeat the multi-block move and the cut/paste inside nested containers (paragraphs in a quote, items in a bulleted list), so a fix that only handles the document's top level does not pass; one moves styled words inside a single paragraph. The other seven repeat those seven longer-run cases in the downward direction. The final child order alone does not say which side moved, so a fix that assumes the lines now at the front were the ones carried passes the upward cases and still loses edits when a block is dragged down. Every assertion reads the visible text only, not Yjs internals. The 137 pass to pass tests run the collaboration and Yjs binding tests to check that normal synchronization, plain reordering and undo are still working.
