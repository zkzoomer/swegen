# What this task requires

lexical is a toolkit for building text editors. a heading is a paragraph with a title style. when someone highlights words and chooses Heading 1, the paragraphs containing those words should change, while nearby paragraphs stay unchanged

the recording shows two mistakes during upward selection. a selected upper line can stay as ordinary text while the lower line becomes a heading. in another case, an upper line becomes a heading even though the selection stops after its last letter and covers only the line break beside it

# Why it is non-trivial

a selection has two ends. the anchor is where it begins and the focus is where it finishes. these names do not tell us which end comes first on the page

stopping at the start of an upper paragraph includes its words when selecting upwards. stopping at the start of a lower paragraph excludes its words when selecting downwards. checking only the focus position can therefore include too much or too little. putting the ends in page order fixes the skipped line, but does not prevent an unselected line from changing

# Why the media is necessary

the short request does not describe either mistake. the recording supplies the selection direction, highlighted words, Heading 1 action and resulting paragraphs

the second mistake requires noticing that touching a line break does not mean selecting the words before it. the video can be paused and enlarged to inspect this. understanding the debug panel's internal names is unnecessary

# The change

the reference changes $setBlocksType in packages/lexical-selection/src/range-selection.ts, which collects paragraphs for formatting. the starting code skips a paragraph whenever the focus is at its start, without considering selection direction

the reference checks the appropriate paragraph boundary for each direction. it excludes a lower paragraph touched only at its start during downward selection, or an upper paragraph touched only at its end during upward selection. it follows text containers so finishing one text piece is not mistaken for finishing the paragraph

# Tests

the bug checks rebuild the playground from the submitted source, select text in Chromium and choose Heading 1 through the toolbar. they check that selected paragraphs change and unselected neighbours stay unchanged across ordinary rich text and line boundaries. this rejects repairs that mistake the end of one text piece for the end of its paragraph

the regression checks protect existing selection and editing behaviour, including empty paragraphs and pictures. they compare formatting and preserved content while allowing equivalent text arrangements and repairs in either the toolbar or shared library
