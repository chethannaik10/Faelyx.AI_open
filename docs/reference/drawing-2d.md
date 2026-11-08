Chapter 1

Drawing Sketches in
the Sketcher
Workbench-I

Learning Objectives

After completing this chapter you will be able to:
• Understand the Sketcher workbench of CATIA V5.
(cid:127) Start a new file in the Part workbench and invoke the Sketcher workbench.
(cid:127) Set up the Sketcher workbench.
(cid:127) Understand some important Sketcher terms.
(cid:127) Draw sketches using some of the tools available in the Sketcher workbench.
(cid:127) Use some of the drawing display tools.

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

1-2

       CATIA for Designers (Evaluation Chapter F007/004)

THE SKETCHER WORKBENCH
Most of the components designed using CATIA are a combination of sketched features, placed
features,  and  derived  features.  The  placed  features  are  created  without  drawing  a  sketch,
whereas the sketched features require a sketch that defines the shape of the sketched feature.
Generally, the base feature of any design is a sketched feature. For example, refer to the solid
model of the Link shown in Figure 1-1. The base sketch to create this solid model is shown in
Figure 1-2.

Figure 1-1  Solid Model of a Link.

Figure 1-2 Base sketch for the solid model.

The Sketcher workbench provides the space and tools to draw sketches of the solid model.
Generally, the first sketch that you draw to start the design is called the base sketch, which
can be converted into a base feature. However, once conversant with the advanced options of
CATIA, you can also use derived feature or a derived part as the base feature. In this chapter,
you will learn more about the sketching tools that are available for drawing and displaying
the sketches in the Sketcher workbench.

To draw a sketch, you need to invoke the Sketcher workbench in the Part Design workbench or
in the Assembly Design workbench. To invoke the Sketcher workbench, choose the Sketch
button from the Sketcher toolbar and then select a plane on which you need to draw the
sketch.  After  drawing  the  sketch  in  this  environment,  proceed  to  the  Part  Design  or  the
Wireframe  and  Surface  Design  workbench  to  convert  the  sketch  into  a  solid  model  or  a
surface model.

STARTING A NEW FILE
When you start CATIA V5R13, a new Product file with the name Product1 is displayed on
the screen, as shown in Figure 1-3. Close the Product1 file and start a new file in the Part
Design workbench. You will learn more about the Product files in the later chapters. After
choosing Close from File menu, the start screen of CATIA V5 is displayed. Choose Start >
Mechanical Design > Part Design to make sure that you are in the Part Design workbench.
Now, to start a new file in the Part Design workbench, choose File from the menu bar. The
New dialog box is displayed, as shown in Figure 1-4. Select Part from the List of Types list

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

Drawing Sketches in the Sketcher Workbench-I

                                 1-3

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

Figure 1-3  Initial screen that appears after starting CATIA V5R13

box provided in the New dialog box. You can also write word Part in the Selection edit box
available at the bottom of the List of Types list box. Choose the OK button.

Figure 1-4  The New dialog box

A new file in the Part Design workbench will be displayed on the screen, as shown in Figure 1-5.
The various standard tools like Specification Tree, Compass, Geometry Axis will help you
in completing the design. The Specification Tree is displayed on the top left corner of the
screen.  The  Compass  is  displayed  on  the  top  right  corner  while  the  Geometry  Axis  is
displayed on the bottom right corner of the screen.

1-4

       CATIA for Designers (Evaluation Chapter F007/004)

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

Figure 1-5  A new Part Design workbench file

Note
You  can  hide  the  Compass,  Specification  Tree,  or  the  Geometry  Axis  by  using  the  View
menu. By default, check marks are displayed on the left of Geometry, Specifications, and
Compass in  the  menu  bar,  suggesting  that  their  display  is  turned  on.  Choose  these  options
again to turn off their display. The display of these tools should be turned off only when the
geometry area is too small to view the model, else it is recommended not to hide these standard
tools.

You can also use the F3 key from the keyboard to toggle the display of Specification Tree.

INVOKING THE SKETCHER WORKBENCH
The sketch is the basic requirement to create the base feature of any solid model. In CATIA,
a sketch is drawn in the Sketcher workbench. To invoke the Sketcher workbench, choose the
down arrow available on the right of the Sketcher button in the Sketcher toolbar; a flyout
appears. Press and hold the left mouse button on the vertical/horizontal line available at the
left/top  of  the  flyout  and  drag  it.  The  flyout  is  now  detached  from  its  parent  toolbar  and
becomes an independent toolbar. Figure 1-6 shows the Sketcher flyout as an independent
toolbar. The two buttons that are available with the Sketcher toolbar are Sketcher and Sketch
with  Absolute  Axis  definition.  The  next  section  focuses  on  invoking  the  Sketcher
workbench using these two buttons.

Drawing Sketches in the Sketcher Workbench-I

                                 1-5

Figure 1-6  The Sketcher toolbar

Invoking the Sketcher Workbench using the Sketcher Button
To  invoke  the  Sketcher  workbench  using  the  Sketcher  tool,  choose  the  Sketcher
button from the Sketcher toolbar. You are prompted to select a plane, planar face, or
a  sketch.  Select  a  plane  from  the  three  default  planes  that  are  available  in  the
Specification Tree or from the geometry area. The Sketcher workbench, that appears after
you select the YZ plane as the sketching plane, is shown in Figure 1-7. The selected plane will
be parallel to the screen and you are prompted to select an object or a command. The sketching
components that are displayed in the geometry area are discussed later in this chapter.

Figure 1-7  Sketcher workbench invoked using the YZ plane as the sketching plane

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

1-6

       CATIA for Designers (Evaluation Chapter F007/004)

Note
Remember that whenever you invoke the Sketcher workbench, you are always into the Select
mode and are prompted to select an object or a command.

To exit the sketcher workbench, choose the Exit workbench button from the Workbench toolbar.

Invoking the Sketcher Workbench using the Sketch with
Absolute Axis Definition Button

In CATIA, you can also define a user-defined absolute axis while invoking the  Sketcher
workbench. This is done using the Sketch with Absolute Axis definition option. To invoke
the Sketcher workbench using this option, choose the Sketch with Absolute Axis definition
button from the Sketcher toolbar. The Sketch Positioning dialog box appears, as shown in Figure 1-8.
You are then prompted to select a plane, two lines, an axis system, a planar face, or a sketch. You can
set the absolute axis by using the options available in this dialog box.

Figure 1-8  The Sketch Positioning dialog box

SETTING UP THE SKETCHER WORKBENCH
After  invoking  the  Sketcher  workbench,  you  need  to  set  the  workbench  as  per  the
sketching or drawing requirements. These requirements include modifying units, grid settings,
and so on. The next section focuses on setting these parameters.

Modifying  Units
To modify units, invoke the Options dialog box by choosing Tools > Options from the menu
bar. Click on the + sign located on the left of the General option to expand the tree. Choose
the Parameters and Measure option; tabs corresponding to this selection will appear on the
right side of the Options dialog box. Now, choose the Units tab. The Options dialog box
after invoking the Units tab is shown in Figure 1-9.

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

Drawing Sketches in the Sketcher Workbench-I

                                 1-7

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

Figure 1-9  Options dialog box with the Units tab selected

Using the options available in the Units area, you can set the units for length, angle, time,
mass, and so on. After setting units, choose the OK button from the Options dialog box.

Modifying the Grid Settings
On  invoking  the  Sketcher  workbench,  you  will  observe  two  types  of  lines  in  the  geometry
area, flowing in the horizontal and vertical directions. These are continuous and dotted black
lines. The spacing between two dotted lines is called Graduation, while the spacing between
two continuous black lines is called Primary Spacing. The mesh that is formed because of
the  intersection  of  these  lines  in  vertical  and  horizontal  direction  is  called  Grid.  In  other
words, Primary Spacing and Graduation define the Grid.

By default, the Graduations is set to 10 in both horizontal and vertical direction. The default
Primary  Spacing  value  is  100mm.  Though  you  can  change  the  Primary  Spacing  and
Graduation value in horizontal and vertical direction individually, yet  it is recommended
not to change these values. If the values of Primary Spacing or Graduations in horizontal
are different than those in the vertical direction, then the Grid is said to be distorted. To
change the values of Primary Spacing and Graduations, choose Tools > Options from the
menu bar; the Options dialog box will be displayed. Choose the Mechanical Design option
from the tree on the left side of the dialog box. Choose the Sketcher option to display the
Sketcher tab on the right side of the Options dialog box, as shown in Figure 1-10.

The  edit  boxes  of  Primary  Spacing  and  Graduations  under  H  row  are  already  enabled.

1-8

       CATIA for Designers (Evaluation Chapter F007/004)

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

Figure 1-10  Options dialog box with the Sketcher option selected

Here, H means the horizontal direction. To enable the edit boxes of Primary Spacing and
Graduations under V row, select the Allow Distortions check box. Here, V means vertical
direction. Next, enter the values in the edit boxes corresponding to the H and V directions.
Choose OK to apply the newly formed Grid to the Sketcher workbench. Note, all the files
that you open or start in the Sketcher workbench, henceforth, will use these values for the
Grid.

UNDERSTANDING THE SKETCHER TERMS
Before learning about the sketching tools, it is important for you to understand some of the
terms that are used in the Sketcher workbench. These terms are discussed in the following
section.

Specification Tree
The  Specification  Tree  is  a  manager,  which  keeps  a  track  of  all  the  operations  that  are
performed on the model. When you invoke the Sketcher workbench, a new member or branch,
Sketch.1, is added to the Tree. Click on the + sign on the right of the PartBody to expand it.
Now, you can view the Sketch.1 member of the Specification Tree. A + sign is associated
with  the  Sketch.1  on  the  branch.  Click  on  this  +sign  once  to  further  expand  the  branch.
Figure 1-11 shows the Tree in expanded form.

The various levels under Sketch.1 in the Tree are discussed next.

Drawing Sketches in the Sketcher Workbench-I

                                 1-9

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

Figure 1-11  The expanded form of the Specification Tree

Tip.  While  expanding  the  branch  of  the  Specification  Tree,  you  may
accidentally  click  on  the  branch  lines.  This  will  make  the  Specification  Tree
active and consequently the geometry area will be frozen. Note, that the color of the
default planes will turn grey. Now, zooming and panning will respectively resize
or  reposition  the  Specification  Tree,  instead  of  the  geometry  view.  The
geometry area can be reactivated by clicking on the branch line again.

AbsoluteAxis
In Sketcher workbench, the default horizontal and vertical axes passing from the origin (0,0), to
infinity  are  referred  to  as  AbsoluteAxis.  The  horizontal  and  vertical  axis  in  the  geometry
area will be highlighted, when the AbsoluteAxis is selected from the Specification Tree . A
+ sign is available on the left of the AbsoluteAxis in the Specification Tree. Click this + sign
once  to  expand  one  down  level  of  the  branch.  The  levels  associated  with  this  branch  are
discussed below.

Origin
The  Origin  in  Sketcher  workbench  is  the  point  where  the  absolute  horizontal  axis
intersects the absolute vertical axis. The coordinates for origin are (0,0). Origin is widely
used while applying dimensional constraints to the sketches. You will learn more about
dimensional constraints in the later chapters.

HDirection
The direction that is parallel to the horizontal axis is referred to as horizontal direction.
The HDirection is mostly used to constrain a sketch.

VDirection
The direction that is parallel to the vertical axis is referred to as vertical direction. The
VDirection is mostly used to constrain a sketch.

The branches in the Specification Tree will increase as the design process continues. While
drawing  and  constraining  sketches,  you  will  learn  more  about  the  branches  that  are
associated with the Specification Tree in Sketcher workbench.

1-10

       CATIA for Designers (Evaluation Chapter F007/004)

Snap to Point

This option is used to snap to the point of intersection of the Primary Spacing and
the Graduation lines while sketching. By default, the snap mode is active. To activate
or deactivate the snap mode, choose the Snap to Point button from the Sketch tools
toolbar, which appears only when you invoke the Sketcher workbench.

Construction/Standard Element

An element that is not a part of the profile while creating features and is used only as
a reference or to constrain the elements of the sketch in the Sketcher workbench is
called a Construction element. The construction elements can be used only in the
Sketcher workbench. A Standard element is the one that takes part in the features
creation. Depending on the requirement of the design, you can convert a standard element
to a construction element or vice a versa using the Construction/Standard Element button.

Sketcher Toolbar
While drawing a sketch, you often need to select some elements. The tools that are required
to perform such a job are available in the Sketcher toolbar, shown in Figure 1-12. Various
tools such as Select, Selection Trap, and so on are available in this toolbar. By default, the
Select tool is activated in the sketcher workbench, unless any other tool or an object is selected.

Figure 1-12  The Sketcher toolbar

The  tools  available  with  Sketcher  toolbar  can  be  invoked  by  choosing  the  down  arrow
available on the right of the Select tool. When you choose the down arrow, the  Select flyout
is displayed. Detach the Select flyout from the Sketcher toolbar by holding it from the vertical/
horizontal line and place it in the geometry area. The Select flyout will now become Select
toolbar, as shown in Figure 1-13 . The tools available in Select toolbar are discussed in the
following section.

Figure 1-13  The Select toolbar

Note
For a better understanding and explanation of the buttons available in the flyout, this book will
refer  a  flyout  as  a  toolbar.  This  means,  whenever  you  are  asked  to  choose  the  down  arrow
available on the right of any button, the flyout that appears, will be called a toolbar. You can
detach this flyout from the parent toolbar and place it in the geometry area.

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

Drawing Sketches in the Sketcher Workbench-I

                                 1-11

Select

This tool allows you to make selection of the elements. As you move the arrow cursor
near the element with Select tool activated, the arrow cursor is replaced with a hand
cursor. Left click on the element to select.

Selection Trap

This  is  a  method  of  selecting  elements  by  creating  a  selection  trap,  which  is  a
rectangular  box  drawn  by  dragging  the  mouse  to  define  the  diagonally  opposite
corners. All the objects that lie fully inside the selection trap are selected. To create
this trap, choose the Selection Trap button from the Select toolbar. Now, specify the first
corner and then drag the mouse to specify the second corner.

Intersecting Trap

An intersecting trap is similar to the selection trap, with the only difference that this
method allows you to select elements of a sketch that are inside or are intersected by
the trap. To create it, choose the Intersecting Trap button from the Select toolbar.

Now specify the first corner and then drag the mouse to specify the second corner.

Polygon Trap

This method includes selecting elements by drawing a closed polygon as the selection trap.
You can select elements of a sketch that are fully inside the polygon by using this method.
Choose the Polygon Trap button from the Select toolbar and draw a closed polygon by

specifying its adjacent corners. Polygon creation can be terminated by double-clicking.

Paint Stroke Selection

This  method  includes  selecting  elements  by  dragging  the  mouse  to  draw  a  paint
stroke across them. The elements that are intersected by the paint stroke are selected.

Outside Trap Selection

The elements that are outside the selection trap are selected by using this method.
The elements that are intersected by the trap are not selected.

Intersecting Outside Trap Selection

The elements that are outside the selection trap or are intersected by the selection
trap are selected by using this method.

Inferencing Lines
The inferencing lines are temporary lines that are used to track a particular point on the
screen.  They  are  automatically  displayed  from  the  endpoints  of  the  sketched  elements  or
from the origin when you select a sketching tool in the sketcher environment. Consider a
case in which you want to draw a line, such that its end point is tangent to the circle. Specify
the start point of the line and then move the cursor in the direction tangent to the circle. You
will  note  that  the  inference  line  is  shown  tangent  to  the  existing  circle.  Now,  specify  the
endpoint of the line. Figure 1-14 shows the use of the inferencing line to draw a line whose
end point is tangent to an existing circle.

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

1-12

       CATIA for Designers (Evaluation Chapter F007/004)

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

Figure 1-14  An example of inferencing line

DRAWING SKETCHES USING THE SKETCHER TOOLS
The  sketching  tools  that  are  used  to  draw  the  sketches  in  the  Sketcher  workbench  are
discussed in the following section.

Drawing Lines

Menu:
Toolbar:

Insert > Profile > Line > Line
Profile > Line

The lines are one of the basic sketching tools available in the Sketcher workbench.
The general definition of a line is the shortest distance between two points. Because
CATIA is parametric in nature, it allows the user to draw a line of any length and at
any angle, and then change it to the desired length and angle. To draw a line, choose the
Line button from the Profile toolbar. There are two methods to draw a line, in CATIA V5.
These methods are discussed next in the following section.

Drawing Lines by Specifying Points in the Geometry Area
To draw a line by specifying points in the geometry area, invoke the Line tool by choosing the
Line button from the  Profile toolbar. You will observe that as you move the cursor in the
geometry  area,  the  coordinates  corresponding  to  the  current  location  of  the  cursor  are
displayed above it.

After invoking the Line tool, you are prompted to select a point or click to locate the start
point of the line. The prompt sequence is displayed in the Current Information or Dialog
Box area of the Status bar available below the geometry area. Click anywhere in the geometry
area  to  specify  the  start  point  of  the  line.  You  are  then  prompted  to  specify  its  endpoint.
Move the cursor away from the start point to specify the endpoint of the line. On moving
from the start point, you will notice a rubber band line is attached to the cursor. Now, click

Drawing Sketches in the Sketcher Workbench-I

                                 1-13

anywhere in the geometry area to specify the endpoint of the line. Figure 1-15 shows a line
drawn by selecting the points from the display area. The orange color of the line specifies that
it is selected. Click anywhere on the screen to end the selection mode. You will notice that the
color of the line is changed to white, which suggests that it is a standard element.

Figure 1-15  Line drawn by selecting the start and
endpoints from the geometry area

Note
A line in CATIA V5 consists of three geometric elements, the start point, the line segment, and
the endpoint. The start and endpoint are construction elements, while the line segment is standard
element.

Drawing Lines Using the Sketch tools Toolbar
Lines can also be drawn using the Sketch tools toolbar, which is expanded when you invoke
the  Line  tool.  Figure  1-16  shows  the  expanded  Sketch  tools  toolbar,  after  you  invoke  the
Line  tool.  There  are  two  methods  to  draw  a  line  using  the  Sketch  tools  toolbar.  These
methods are discussed next.

Figure 1-16   Expanded form of the Sketch tools toolbar after invoking the Line tool

Drawing Lines by entering the Start and End point values
To  draw  a  line  using  the  start  and  endpoint  values,  invoke  the  Line  tool.  The  Sketch
tools toolbar will expand. In the Start Point H and V edit boxes, specify the horizontal
and vertical coordinates values of the start point, respectively, and then press ENTER
from the keyboard. You are then prompted to enter the coordinates values for the endpoint.
Specify the values in the End Point H and V edit boxes and press ENTER again. A line is
drawn  in  the  geometry  area  corresponding  to  the  entered  values  of  the  start  and
endpoints and these dimensions of the start and endpoints are displayed from the origin.

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

1-14

       CATIA for Designers (Evaluation Chapter F007/004)

You will also observe that the Sketch tools toolbar is compressed to its original size after
the line is drawn. The color of the line created is orange, suggesting it is selected. To end
the selection mode click anywhere in the geometry area. The line will appear green in
color, which means that the line is fully constrained. You will learn more on constraints in
later chapters.

Similarly, you can draw a line by specifying the start point and entering the length and
angle values.

Note
The dimension values for the start and endpoint that you have entered are displayed, because
the Dimensional Constraint button is chosen in the Sketch tools toolbar. Let these values
remain in the geometry area.

You will also notice that the color of construction elements such as the start and endpoints of the
line  is  green.  This  suggests  that  element  is  fully  constrained.  You  will  learn  more  about
dimensioning and constraining of sketches, in later chapters.

Drawing Lines with Symmetrical Extension

To draw a line with symmetrical extension, invoke the Line tool and choose the
Symmetrical Extension button from the expanded Sketch tools toolbar. When
you draw the line using this option, its total length is double the distance you

moved, while specifying the start point and the endpoint.

In CATIA, few more types of lines such as, infinite line, bisecting line, and bi-tangent
line can be drawn. To draw these lines, choose on the down arrow available on the right
of  Line  button  from  the  Profile  toolbar.  The  Line  toolbar  will  appear,  as  shown  in
Figure  1-17.  The  types  of  lines  that  can  be  drawn  using  the  Line  toolbar  are
discussed next.

Figure 1-17  The Line toolbar

Drawing Infinite Lines

Menu:
Toolbar:

Insert > Profile > Line > Infinite Line
Profile > Line > Infinite Line

To draw an infinite line, invoke the Infinite Line tool from the Line toolbar. The Sketch
tools toolbar is expanded. You can draw horizontal infinite line, vertical infinite line,
and infinite line through two points using the options available in this toolbar.

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

Drawing Sketches in the Sketcher Workbench-I

                                 1-15

Drawing Bi-Tangent Lines

Menu:
Toolbar:

Insert > Profile > Line > Bi-Tangent Line
Profile > Line > Bi-Tangent Line

Bi-Tangent lines are the lines that are tangent to two circles, arcs, ellipses, conics, or
any  curved  geometry.  You  will  learn  more  about  these  curved  geometries  later  in
this  chapter.  To  draw  a  bi-tangent  line,  invoke  the  Bi-Tangent  Line  tool  from  the
Line toolbar. Select the first element or the first curve geometry and then select the
second  element.  A  line  will  be  drawn  between  the  two  selected  curved  elements.  You  will
notice that tangency symbol is visible on the endpoints of the bi-tangent line. These are the
tangent constraints. You will learn more on the tangent constraints in later chapters.

Drawing Bisecting Lines

Menu:
Toolbar:

Insert > Profile > Line > Bisecting Line
Profile > Line > Bisecting Line

Bisecting  lines  are  the  lines  that  pass  through  two  intersecting  lines  such  that  the
angle formed between them is divided equally. To draw a bisecting line, invoke the
Bisecting Line tool from the Line toolbar. Select the first line and then select the
second line. A bisecting line of infinite length is drawn.

Drawing Line Normal To Curve

Menu:
Toolbar:

Insert > Profile > Line > Line Normal To Curve
Profile > Line > Line Normal To Curve

To draw a line normal to a curve, choose the Line Normal To Curve button from the
Line toolbar. Specify the start point of the line anywhere in the geometry area; you
are  prompted  to  select  the  curve.  After  you  select  the  curve,  a  line  normal  to  the
selected curve is drawn.

Tip. You can use the ESC key from the keyboard to exit a tool, which is currently
active.

Drawing Center Lines

Menu:
Toolbar:

Insert > Profile > Axis
Profile > Axis

You can draw a center line in CATIA using the Axis tool. Generally, the axis tool is
used  to  create  the  axis  for  the  revolved  feature.  You  will  learn  more  about  the
revolved features in the later chapters. To draw an axis, invoke the Axis tool from
the Profile toolbar. The Sketch tools toolbar is expanded and you are prompted to
specify the start point of the axis. Click in the geometry area to specify the start point. You

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

1-16

       CATIA for Designers (Evaluation Chapter F007/004)

are then prompted to specify the endpoint
of  the  axis.  Move  the  cursor  and  click  to
specify the endpoint of the axis. An axis with
the  specified  points  is  displayed  in  the
geometry area, as shown in Figure 1-18. You
can  also  draw  an  axis  by  entering
parameters  in  the  respective  edit  boxes  of
the expanded Sketch tools toolbar.

Note
An  axis  is  a  construction  element.  Its
applications  are  discussed  in  later
chapters.

Figure 1-18  An axis drawn in the geometry area

Drawing Rectangles, Oriented Rectangles, and
Parallelograms

Rectangle  is  a  basic  geometry  that  comprises  of  four  sides.  The  adjacent  sides  are
perpendicular to each other and opposite sides are equal in length. To draw a rectangle,
choose the arrow available on he right of the Rectangle button in the Profile toolbar.
The Predefined Profile toolbar will be displayed, as shown in Figure 1-19. The tools available in
this toolbar are Rectangle, Oriented Rectangle, Parallelogram, and so on. Some of these
tools are discussed here and the remaining tools will be discussed in the next chapter.

Drawing Rectangles

Menu:
Toolbar:

Insert > Profile > Predefined Profile > Rectangle
Profile > Predefined Profile > Rectangle

To draw a rectangle invoke, the Rectangle tool from the Predefined Profile toolbar,
as shown in Figure 1-19.

Figure 1-19  The Predefined Profile toolbar

When you invoke the Rectangle tool, the Sketch tools toolbar is expanded. You are prompted
to click the first point to create a rectangle. Click in the geometry area to specify the first
point or the first corner of the rectangle. Next, you are prompted to specify the second point.

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

Drawing Sketches in the Sketcher Workbench-I

                                 1-17

Move the cursor away from the first point to specify it. You will notice that the preview of the
rectangle is displayed as you move the cursor in the geometry area. Click in the geometry
area to specify the diagonally opposite corner of the rectangle.

Note
The rectangle drawn in CATIA  is a combination of four lines and each line is an individual
element.

You can also draw a rectangle by entering the values in the Sketch tools toolbar. On drawing
a rectangle by this method, you will notice that few dimensions and constraints are applied to the
resulting rectangle. You will learn more about dimensioning and constraining in later chapters.

Drawing Oriented Rectangles

Menu:
Toolbar:

Insert > Profile > Predefined Profile > Oriented Rectangle
Profile > Predefined Profile > Oriented Rectangle

To  draw  an  oriented  rectangle,  invoke  the  Oriented  Rectangle  tool  from  the
Predefined Profile toolbar. You are prompted to specify the first point. Click in the
geometry area to specify the first point of the rectangle. You are then prompted to
specify the end point. Move the cursor away from the first point in any direction to specify
the end point of the first side. You will notice that a line is attached to the cursor. Click in the
geometry  area  to  specify  the  end  point.  The  angle  thus  formed  between  the  line  and  the
horizontal reference is the orientation angle of the rectangle.

You  are  then  prompted  to  define  the  second  side.  Move  the  cursor  in  the  upward  or
downward  direction  of  the  line  and  you  will  notice  the  rectangle  being  drawn.  Also,  the
symbol  of  perpendicular  constraint  is  displayed  between  the  line  drawn  and  the  line
attached  with  the  cursor.  You  will  learn  more  on  constraints  in  later  chapter.  Click  in  the
geometry  area  to  specify  the  third  corner  of  the  rectangle.  Figure  1-20  shows  an  oriented
rectangle being drawn.

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

Figure 1-20  Selecting corner points to draw an oriented rectangle

1-18

       CATIA for Designers (Evaluation Chapter F007/004)

Note
You can also use Sketch tools toolbar to enter the coordinates values for first, second, and third
corners in the respective edit boxes. To specify the orientation of the rectangle, enter the value of
the orientation angle in the A edit box of the Sketch tools toolbar. Press Enter once you have
entered the values.

Drawing Parallelograms

Menu:
Toolbar:

Insert > Profile > Predefined Profile > Parallelogram
Profile > Predefined Profile > Parallelogram

A parallelogram is a quadrilateral whose opposite sides are parallel to each other. To
draw it, invoke the Parallelogram tool from the Predefined Profile toolbar; the Sketch
tools  toolbar  is  expanded.  You  are  prompted  to  specify  the  start  point  of  the
parallelogram. Click in the geometry area to specify its first corner. You are then prompted
to specify the end point of its first side. On moving the cursor away from the first corner, you
will notice a line attached to the cursor. The line shows the first side of the parallelogram.
Click  in  the  geometry  area  to  specify  its  end  point.  You  are  then  prompted  to  specify  its
second side. Move the cursor away from the second corner; the preview of the parallelogram
is displayed. Click to specify its second side. A parallelogram is created, as shown in  Figure 1-21.

Figure 1-21  A parallelogram drawn by specifying corner points

Note
In CATIA, a parallelogram also is a combination of four lines, where each line is an individual
element. You can also use the Sketch tools toolbar to enter the coordinates values of the corner
points of the parallelogram. You can enter the width, angle, and height values in the respective
edit boxes of the expanded Sketch tools toolbar to specify its parameters.

Drawing Points

A point is defined as the geometrical element that has no magnitude, length, width,
or thickness. It is only specified by its position. In CATIA, you can draw points by
clicking in the geometry area or by specifying the coordinates. You can also locate
an  intersection  point  or  project  a  point  on  an  element.  To  invoke  any  of  these  methods,

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

Drawing Sketches in the Sketcher Workbench-I

                                 1-19

choose on the down arrow available on the right of the Point button in the Profile toolbar.
The Point toolbar is displayed, as shown in Figure 1-22.

Figure 1-22  The Point toolbar

Drawing Points by Clicking

Menu:
Toolbar:

Insert > Profile > Point > Point
Profile > Point > Point by Clicking

To  draw  points  by  clicking,  invoke  the  Point  by  Clicking  tool  by  from  the  Point
toolbar; the Sketch tools toolbar is expanded. You are prompted to click to create
the  point.  Click  to  a  point.  You  will  notice  a  plus  sign  (+)  is  displayed  in  the
geometry area. You can also enter the horizontal and vertical coordinates values in the H
and  V  edit  boxes  of  the  Point  Coordinates  area  displayed  in  the  expanded  Sketch  tools
toolbar.

You can create points by defining its coordinates using other options available in the Point
toolbar.  You  can  also  create  equidistant  points,  intersection  points,  and  projection  points
using these options.

Drawing Circles

A  circle  is  defined  as  the  path  formed,  when  a  series  of  points  called  locus  moves
from a given point called the center, with a fixed distance called the radius. To draw
a  circle,  choose  the  down  arrow  available  on  the  right  of  the  Circle  button  in  the
Profile toolbar. The Circle toolbar is displayed, as shown in Figure 1-23. The available tools
will help you to draw circles and arcs. The tools of this toolbar that help in drawing a circle
are discussed next.

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

Figure 1-23  The Circle toolbar

1-20

       CATIA for Designers (Evaluation Chapter F007/004)

Drawing Circles

Menu:
Toolbar:

Insert > Profile > Circle > Circle
Profile > Circle > Circle

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

To draw a circle, invoke the Circle tool from the Circle toolbar. You are prompted to
specify its center. Click anywhere in the geometry area to specify the center point.
Now, you are prompted to specify a point that determines the radius of the circle.
Move the cursor away from the center point to specify the radius of the circle, the preview of
the circle is displayed. Click in the geometry area to define the radius of the circle.

Note
You can also draw a circle by specifying the coordinate values for the center point and the radius
value in the R edit box of the expanded Sketch tools toolbar.

Drawing a Three Point Circle

Menu:
Toolbar:

Insert > Profile > Circle > Three Point Circle
Profile > Circle > Three Point Circle

A circle can also be drawn by specifying three points that lie on the circle. To draw a
three point circle, invoke the Three Point Circle tool from the Circle toolbar; the
Sketch tools toolbar is expanded. You are prompted to specify the start point of the
circle. Click anywhere in the geometry area to specify the first point in the geometry area.
You are then prompted to specify the second point through which the circle will pass. As you
move the cursor away from the first point to specify the second point, a dotted line is displayed.
The dotted line originates from the first point and moves along with the cursor. This is the
chord of the circle. Click in the geometry area to specify the second point on the circle. You
are then prompted to specify its last point. As you move the cursor to specify the third, the
preview of the circle is displayed. Click to specify its third point.

Note
You can also enter the radius value in the R edit box of the expanded Sketch tools toolbar.
Remember  that  when  you  enter  the  radius  value,  the  other  two  points  that  lie  on  the  circle
should be specified within the reach of the radius value.

Drawing Circles using Coordinates

Menu:
Toolbar:

Insert > Profile > Circle > Circle...
Profile > Circle > Circle Using Coordinates

In CATIA, circles can also be drawn by entering the absolute coordinates values of
the center and the radius. To draw a circle by entering the coordinate values, invoke
the  Circle  Using  Coordinates  tool  from  the  Circle  toolbar;  the  Circle
Definition  dialog  box  is  displayed.  You  can  specify  the  coordinate  values  of  the

center point and the radius using the option available in this dialog box.

Drawing Sketches in the Sketcher Workbench-I

                                 1-21

Drawing Tri-Tangent Circles

Menu:
Toolbar:

Insert > Profile > Circle > Tri-Tangent Circle
Profile > Circle > Tri-Tangent Circle

A tri-tangent circle is one that is tangent to three sketched elements. The circle thus
formed has a tangent relation with all the three elements. To draw it, you first need
to  draw  three  elements,  which  can  be  lines,  circles,  ellipses,  arcs,  or  any
geometrical element, to which a circle can form a tangent relation. Then invoke the Tri-Tangent
Circle tool from the Circle toolbar. Select the three elements one by one. A circle tangent to
all these three elements is displayed in the geometry area. Notice that some constraints are
applied to the circle. You will learn more about these constraints in later chapters.

Note
The location of the elements to be selected, to create tri-tangent circle is important because, its
creation depends on the position of these selected elements. Also, the tangents are created as close
as possible, to where you clicked on these selected lines. In case, if the element has to be extended
to fulfill the need of tangent relation, CATIA V5 will form a circle tangent to that element,
without actually extending the element.

Drawing Arcs
An arc is a geometric element that forms a sector of a circle or ellipse. Every arc must include
at least two points. The tools that are required to draw arcs are available in the Circle toolbar. In
CATIA, there are three methods to draw an arc. These methods are discussed next.

Drawing an Arc by Defining the Center Point

Menu:
Toolbar:

Insert > Profile > Circle > Arc
Profile > Circle > Arc

To  draw  an  arc  by  defining  its  center  point,  invoke  the  Arc  tool  from  the  Circle
toolbar. You are prompted to specify the center point. Click to specify the arc center.
You  are  then  prompted  to  define  the  radius  and  start  point  of  the  arc.  Move  the
cursor away from the center point to specify the start point of the arc; the preview of
a circle is displayed in the geometry area. Now, click to specify the start point of the arc. You
are then prompted to specify the endpoint of the arc. As you move the cursor, the preview of
the arc is displayed. Click in the geometry area to specify the endpoint of the arc. Figure 1-24
shows an arc drawn using this method.

Drawing Three Point Arc

Menu:
Toolbar:

Insert > Profile > Circle > Three Point Arc
Profile > Circle > Three Point Arc

To draw a three point arc, invoke the Three Point Arc tool from the Circle toolbar.
You  are  prompted  to  specify  the  start  point  of  the  arc.  Click  anywhere  in  the
geometry area to specify its start. Next, you are prompted to select the second point
through which the arc will pass. As you move the cursor away from the first point to specify

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

1-22

       CATIA for Designers (Evaluation Chapter F007/004)

Figure 1-24  An arc

the  second  point,  a  dotted  chord  is  displayed.  Click  to  specify  the  second  point.  You  are
prompted to specify the endpoint of the arc. The preview of the arc is displayed as you move
away  from  the  previous  point.  Click  in  the  geometry  area  to  specify  its  endpoint.
Figure 1-25 shows selecting the first, second, and third point to draw a three point arc.

Figure 1-25  Selecting points to draw a three point arc

Drawing Three Point Arc Starting With Limits

Menu:
Toolbar:

Insert > Profile > Circle > Three Point Arc Starting With Limits
Profile > Circle > Three Point Arc Starting With Limits

While  drawing  a  three  point  arc  starting  with  limits,  you  can  start  drawing  it  by
specifying the start and endpoint of the arc first and then third point anywhere on it.
To  draw  a  three  point  arc  starting  with  limits,  invoke  the  Three  Point  Arc  With
Limits tool from the Circle toolbar. You are then prompted to specify the start point of the
arc. Click in the geometry area to specify the start point. You are then prompted to specify

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

Drawing Sketches in the Sketcher Workbench-I

                                 1-23

the endpoint of the arc. Move the cursor away from the start point and click to specify the
endpoint of the arc. You are then prompted to specify the second point the arc will go through.
As you move the cursor to specify this point, the preview of arc is displayed. Click to specify
the point on the arc. Figure 1-26 shows selecting the first, second, and third point to draw an
arc using this option.

Figure 1-26  Selecting points to draw a three point arc starting with limits

Drawing Profiles

Menu:
Toolbar:

Insert > Profile > Profile
Profile > Profile

In  CATIA,  a  profile  is  defined  as  a  combination  of  continuous  lines  and  arcs.
Drawing a continuous line means, the line automatically starts at the endpoint of the
previous line. A profile can be an open or a closed contour. To draw a profile, invoke
the Profile tool from Profile toolbar. The Sketch tools toolbar expands and the Line tool is
chosen in this toolbar. You are prompted to select the start point of the profile.

Click anywhere in the geometry area to specify the start or the first point. Now, move the
cursor away from the first point; a rubber-band line is attached to the cursor with its first
point fixed to the point you had specified. Click anywhere in the geometry area to specify the
endpoint of the line or the second point of the profile. Move the cursor away from the second
point to draw the second line that is in continuation with the first line. You will notice  the
second line originating from the endpoint of the first line. Click anywhere in the geometry
area to specify the endpoint of the second line or the third point of the profile.  To exit the
Profile tool after drawing an open profile, choose the Profile button again. If you draw a
closed profile, then you do not need to close the profile by choosing the Profile button from
the Profile toolbar. This tool is automatically terminated when you specify the point to close
the profile. Figure 1-27 shows an open profile.

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

1-24

       CATIA for Designers (Evaluation Chapter F007/004)

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

Figure 1-27  An open profile drawn using the Profile tool

You will notice that the expanded Sketch tools toolbar has three buttons: Line, Tangent Arc,
and Three Point Arc, as shown in Figure 1-28. When you invoke the Profile tool, the Line
button is chosen by default. The profile that you have been drawing so far, using the Profile
tool, is a combination of continuous lines. The process to draw an arc in continuation with
the line using the Profile tool is discussed next.

Figure 1-28  A section of the expanded Sketch tools toolbar

Drawing a Tangent Arc Using the Profile Tool
To draw a tangent arc in continuation with the line, invoke the Profile tool from the Profile
toolbar. You will notice that currently the Tangent Arc button is frozen. This is because you
first need to draw at least one line. After drawing a line, the Tangent Arc button is available.
Choose the Tangent Arc button from the expanded Sketch tools toolbar; the preview of the
arc is displayed in the geometry area. You are prompted to specify the endpoint of the arc.
Click in the geometry area to specify the endpoint. An arc, tangent to the line is drawn and
displayed  in  the  geometry  area.  Figure  1-29  shows  a  tangent  arc  being  drawn  using  the
Profile tool. After you draw the arc, the line tool is again chosen in the Sketch tools toolbar
and you are prompted to specify the endpoint of the current line.

Note
You will notice a constraint is applied between the line and the arc. This is the tangent constraint.
You will learn more about constraints in the later chapters.

Drawing Sketches in the Sketcher Workbench-I

                                 1-25

Figure 1-29  A tangent arc being drawn using the Profile tool

Drawing Three Point Arc using the Profile Tool
To draw a three point arc using the Profile tool, invoke it from the Profile toolbar; you will notice the
Three Point Arc button is available in the Sketch tools toolbar. You have two options, to draw the line
first and then the three point arc, or to choose the Three Point Arc button first to draw a three point
arc and then draw a line. Out of these two options, you will learn to draw the line first and then the
three point arc. Draw a line using the Profile tool. Without specifying the third point of the profile
choose the Three Point Arc button from the expanded Sketch tools toolbar; you are prompted to
specify the second point of the arc. Remember, the first point of the three point arc is the endpoint of
the line you have drawn. Click in the geometry area to specify the second point of the arc. You are then
prompted to specify its last point. Move the cursor and click to specify the last point. The three point
arc is displayed in the geometry area. The Profile tool is still active and you are prompted to specify the
endpoint of the current line. You can choose the Profile button again to end the Profile tool, or
continue with the tool by specify

geometry area.

DRAWING DISPLAY TOOLS
The drawing display tools for viewing drawing elements or geometries are available in the  View
toolbar, as shown in Figure 1-30. The basic tools such as, Zoom, Rotate, Pan, Normal View, Hide/Show,
and Fit All In will be discussed next. You will learn about the remaining tools in later chapters.

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

Figure 1-30  The View toolbar

1-26

       CATIA for Designers (Evaluation Chapter F007/004)

Fit All In

Menu:
Toolbar:

View > Fit All In
View > Fit All In

The Fit All In tool is used to increase the geometry area so that all the sketched elements or
geometry are included in the available visible space. Note, that if a drawing consists of
dimensions that are beyond the available visible space, invoking this tool will include
them in the available visible space. You will learn more about dimensions in the later chapters.

Pan

Menu:
Toolbar:

View > Pan
View > Pan

The Pan tool is used to drag the current view in the geometry area. This option is
generally used to display the elements or part of elements that are outside the available
geometry area, without actually changing the magnification of the current drawing.

It is like holding a portion of the sketch and dragging it across the geometry area.

Zoom In

Menu:
Toolbar:

View > Modify > Zoom In
View > Zoom In

The  Zoom  In  tool  is  used  to  zoom  into  the  sketches  in  increments.  Choose  this
button once to zoom into the sketch.

Zoom Out

Menu:
Toolbar:

View > Modify > Zoom Out
View > Zoom Out

The  Zoom  Out  tool  is  used  to  zoom  out  of  the  sketch  in  increments.  Choose  this
button from the View toolbar once to zoom out of the sketch.

Note
You can also dynamically zoom in or zoom out using the Zoom In Out option from the View
menu. To zoom into the sketches using the Zoom In Out tool, press and hold the left mouse
button and then drag the mouse upward. To zoom out of the sketches using the Zoom In Out
tool,  press  and  hold  the  left  mouse  button  and  then  drag  the  mouse  downward.  The  tool  is
automatically terminated once you release the left mouse button.

Zoom Area

Menu:

View > Zoom Area

The Zoom Area tool is used to define an area to be magnified and viewed in the available
geometry  area.  The  area  is  defined  using  two  diagonal  points  of  a  rectangular  box  in  the
geometry area. Press and hold the left mouse button to specify the first corner point then

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

Drawing Sketches in the Sketcher Workbench-I

                                 1-27

drag the mouse to specify the other corner point of the box. The area that is enclosed inside
the window will be magnified and displayed.

Normal View

Menu:
Toolbar:

View > Modify > Normal View
View > Normal View

The Normal View tool is used to orient the view normal to the plane in the current
Sketcher workbench. This is generally used to orient the sketching plane normal to
the  view  if  its  orientation  is  changed.  If  the  current  view  is  already  normal  to  the
screen and you choose the Normal View button from the View toolbar, the viewing plane is
reversed. In other words, if the front plane is the current viewing plane, as you choose this
button, the back plane will become active for viewing.

Note
By  default,  whenever  you  invoke  the  Sketcher  workbench  without  defining  any  particular
orientation, the positive horizontal reference direction points toward the right of the geometry
area and the positive vertical reference direction points toward its upper side. If you choose the
Normal View button, the direction of the horizontal reference will be reversed by 180-degree.
That means, the positive horizontal reference direction will now be pointing toward the left of
the geometry area. Note that the vertical reference direction remains unchanged.

If accidently the sketch view is rotated while you are working in the Sketcher workbench, then
you can choose the Normal View button to reorient the view normal to the sketching plane.

Hide/Show

Menu:
Toolbar:

View > Hide/Show > Hide/Show
View > Hide/Show

To hide a sketcher element, or geometric element, you can invoke the Hide/Show
tool  by  choosing  the  Hide/Show  button  from  the  View  toolbar.  As  you  choose  the
Hide/Show button, you are prompted to select an element. Click on the element to
hide from the geometry area. You will notice that the particular element is no longer visible.
The following tool explains how to redisplay the hidden elements.

Swap Visible Space

Menu:
Toolbar:

View > Hide/Show > Swap visible space
View > Swap visible space

The  hidden  element,  or  geometric  element  are  stored  in  a  space  other  than  the
current display space. To view the space where all hidden elements are stored, invoke
the  Swap  visible  space  tool  from  the  View  toolbar.  You  will  notice  that  the
background of the current geometry area changes to green and only the hidden elements are
visible. Invoke the Hide/Show tool and select the hidden elements from this space. To return
back to the geometry area, choose the Swap visible space button again. Note that when you
hide an element, only its display is turned off, but it participates in the feature creation.

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

1-28

       CATIA for Designers (Evaluation Chapter F007/004)

Note
Even if you draw any sketch in the space containing the hidden elements, it will not be visible
and will be displayed only after you return back to the visible geometry area.

You can change the standard element to a construction element in this space or vice-a-versa.

TUTORIALS
Tutorial 1

In this tutorial, you will draw the sketch of the model shown in Figure 1-31. The sketch is
shown in Figure 1-32. You will not dimension the sketch. The solid model and the dimensions
are given only for your reference.
    (Expected time: 30 min)

Figure 1-31  Solid Model for Tutorial 1

Figure 1-32  Sketch of the model

The following steps are required to complete this tutorial:

a. Start CATIA V5 and then start a new CATpart file.
b. Draw the sketch of the model using the Line, Arc, and Circle tools, refer to Figures 1-35

and 1-36.
Save and close the file.

c.

Starting CATIA V5 and Opening a New Part File
1. Start CATIA V5 by choosing Start > Programs (All Programs if you are working with
Windows XP > CATIA > CATIA V5R13 or by double-clicking on the shortcut icon of
CATIA V5R13 available on the desktop of your computer.

A new Product1 file is started.

2. On choosing Close from File menu, the start screen of CATIA V5 is displayed. Choose
Start  >  Mechanical  Design  >  Part  Design  to  make  sure  that  you  are  in  Part  Design
workbench.  To  open  a  new  file  in  Part  Design  workbench,  choose  File  >  New  from
menu bar. The New dialog box is displayed, as shown in Figure 1-33.

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

Drawing Sketches in the Sketcher Workbench-I

                                 1-29

Figure 1-33  Selecting Part from the New dialog box

3. Select  Part  from  the  List  of  Types  list  box  from  this  dialog  box  and  choose  the  OK

button.

A new file in the Part Design workbench is opened.

4. Choose the  Sketcher button  from  the  Sketcher  toolbar  and  then  select  the  YZ
plane as the sketching plane, to invoke the Sketcher workbench. The screen that
is displayed by invoking the Sketcher workbench, is shown in Figure 1-34.

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

Figure 1-34  Sketcher workbench screen

1-30

       CATIA for Designers (Evaluation Chapter F007/004)

You will draw the sketch in two sections, first as the outer loop and second as the inside circle.

Drawing the Outer Loop of the Sketch

It is recommended to create the sketch symmetrically around the origin. This will reduce
the  time  required  for  constraining  and  dimensioning  the  sketches.  The  outer  loop  of
sketch can be drawn using the Line and the Arc tools. You will start drawing the outer
loop from the lower left corner of the sketch.

1.

Invoke the Line tool by choosing the Line button from the Profile toolbar.

2. Choose the Snap to Point button from the Sketch tools toolbar, if not already chosen.

3. Move the cursor in the third quadrant. The coordinates of the point will be displayed

along with the cursor.

4. Click  at  the  point  whose  coordinates  are  -50mm,  -30mm,  and  then  move  the  cursor

horizontally toward the right.

You will notice that the color of line turns blue, when you move the cursor horizontally.

Note
Whenever a line turns blue while drawing, it means that the line is constrained. The constraint
may be horizontal or vertical, depending on the direction in which the line is drawn.

All the constraints that are applied to the drawn sketch will not be explained in this tutorial. You
will learn about such constraints individually in later chapters.

Refer to Figure 1-32. The length of the first horizontal line at the lower left corner of the
sketch  is  30mm.  Therefore,  move  the  cursor  until  the  length  of  the  line  is  shown  as
30mm in the L edit box of the Sketch tools toolbar.

5. Press the left mouse button, when the length of the line in the L edit box of the Sketch

tools toolbar displays a value of 30mm.

The first horizontal line is drawn. You will notice a Horizontal constraint is applied on it.
After the line is drawn, it is still active and is displayed in orange color. Left click in the
geometry area to make sure it is no more selected.

As soon as you specify the endpoint of line, the Line tool is terminated. Therefore, you
need to choose this button again and again to draw multiple lines. You can avoid this by
double-clicking on the Line button in the Profile toolbar. Now, the line tool will not be
terminated until you terminate it by pressing ESC key twice on the keyboard.

6. Double-click on the Line button to invoke the Line tool and select the endpoint of the

first horizontal line.

7. Press the TAB key thrice on the keyboard to highlight the value displayed in the L edit

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

Drawing Sketches in the Sketcher Workbench-I

                                 1-31

box of the Sketch tools toolbar. Type 8 in this edit box and press the ENTER key.

8. Now move the cursor vertically upward and click when a vertical line is displayed.

A vertical line of length 8mm will be drawn. You will notice that this line is no longer in
the select mode and you are prompted to select the start point of the next line. This is
because  of  double-clicking  on  the  Line  button.  It  makes  the  Line  tool  active  till  you
invoke any other tool.

9. Select the endpoint of the vertical line as the start point of the second horizontal line.
Enter  75  in  the  L  edit  box  of  the  Sketch  tools  toolbar.  Move  the  cursor  horizontally
toward the right and click when a horizontal line is displayed.

This draws the second horizontal line of length 75mm.

10. Select the endpoint of the second horizontal line, as the start point of the second vertical
line and move the cursor vertically downward. Click when the length of the line in the L
edit box shows a value of 8mm.
This draws the second vertical line of length 8mm.

Note
You will notice that while drawing the second vertical line, the inferencing line is displayed in
the geometry area. The inferencing lines are often displayed whenever the endpoint of a line is
constrained, with an element already available in the sketch.

11. Select the endpoint of the second vertical line as the start point of the third horizontal
line and move the cursor horizontally toward the right. Click to draw the third horizontal
line, when the length of the line in the L edit box shows a value of 45mm.

12. Select the endpoint of the previous line as the start point of the third vertical line and

move the cursor vertically upwards. Click when the length of the line is 50mm.

This draws the third vertical line of length 50mm. Next, you can draw the arc.

13. To draw the arc, first invoke the Circle toolbar, by choosing the down arrow available on
the  right  of  the  Circle  button,  from  the  Profile  toolbar.  Choose  the  Three  Point  Arc
button from to invoke the Three Point Arc tool.

14. Select the start point of the arc as the endpoint of the previous vertical line and click on it.

15. Move the cursor to a point whose coordinates are 70mm, 50mm. These are displayed in
the Sketch tools toolbar and also on top of the cursor. Click on this point to define the
second point.

16. Move the cursor to specify the third point of the arc. Click on the point when the cursor
snaps  a  location  40mm,  20mm  in  the  geometry  area.  The  coordinate  values  are
displayed on top of the cursor.

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

1-32

       CATIA for Designers (Evaluation Chapter F007/004)

This draws the arc for the outer loop. As the arc is in selection mode, click anywhere in
the geometry area to end the selection mode. Now, to continue drawing the outer loop,
you need to invoke the Line tool again.

17. Double-click on the Line button from the Profile toolbar to invoke the Line tool.

18. Select  the  endpoint  of  the  arc  as  the  start  point  of  the  fourth  vertical  line.  Move  the
cursor vertically downward to draw it. Click when the length value of the line is 20mm in
the L edit box of the Sketch tools toolbar.

This draws the fourth vertical line of length 20mm. The line is no longer in selection
mode and you are prompted to enter the start point of the next line.

19. Select the endpoint of the previous line as the start point of the fourth horizontal line.
Move the cursor horizontally toward left. Click when the length of the line in the L edit
box of the Sketch tools toolbar shows a value of 80mm.

This  draws  the  fourth  horizontal  line  of  length  80mm.  Note  that  the  line  is  green  in
color, as it passes through the origin.

20. Select the endpoint of the previous line as the start point of the inclined line. Move the
cursor such that the line is drawn at an angle of 225-degree. The current angle will be
displayed in the A edit box of the Sketch tools toolbar. Click when a vertical inferencing
line is displayed between the endpoint of the inclined line and the start point of the first
horizontal line. This draws the inclined line of horizontal length values 10mm.

21. Select  the  endpoint  of  the  inclined  line  as  the  start  point  of  the  next  line.  Move  the
cursor vertically downwards. Click when the length of the line in the L edit box shows a
value of 20mm.

This completes the sketch of the outer loop. It is recommended to modify the geometry
area, such that the sketch fits in the screen. This is done using the Fit All In tool.

22. Choose the Fit All In button from the View toolbar to fit the current sketch on the screen.

The outer loop of the sketch is completed and is shown in Figure 1-35. The display of the
constraints is turned off using the Hide/Show tool.

Drawing Inner Circle

The circle will be drawn using the Circle tool.

1. Choose the Circle button from the Circle toolbar to invoke the Circle tool. You

are prompted to define the center point of the circle.

2. Move the cursor to a point whose coordinates are 70mm, 20mm. Click when the cursor

snaps to this point.

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

Drawing Sketches in the Sketcher Workbench-I

                                 1-33

Figure 1-35  Outer loop of the sketch

3. Move the cursor horizontally toward the right and click when the radius of the circle in
the R edit box of the Sketch tools toolbar shows a value of 15mm. Click anywhere to
remove the circle from selection.

This completes the sketch for Tutorial 1. The final completed sketch for Tutorial 1 with
the display of constraints turned on is shown in Figure 1-36.

Figure 1-36  Final sketch for Tutorial 1

Saving and Closing the Sketch

After completing the sketch, you need to save it. You need to  save each tutorial of this
chapter in the c01 folder, that is in the CATIA folder.

1. Choose the Save button from the Standard toolbar to invoke the Save As dialog
box. Create CATIA folder inside the \My Documents folder. Then create c01 folder
inside the CATIA folder.

2. Enter  the  name  of  the  file  as  c01tut1  in  the  File  name  edit  box  and  choose  the  Save

button. The file will be saved in the \My Documents\CATIA\c01 folder.

3. Close the part file by choosing File > Close from the menu bar.

Tip. If you open a file that was saved in the Sketcher workbench, it will be opened
in the Sketcher workbench only and not in the Part Design workbench.

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

1-34

       CATIA for Designers (Evaluation Chapter F007/004)

Tutorial 2

In this tutorial, you will draw the sketch of the model shown in Figure 1-37. The sketch is
shown in Figure 1-38. You will not dimension the sketch. The solid model and the dimensions
are given only for your reference.
    (Expected time: 30 min)

Figure 1-37  Solid Model for Tutorial 2

Figure 1-38  Sketch of the model

The following steps are required to complete this tutorial:

a. Start a new CATpart file.
b. Draw the sketch of the model using the Profile and Rectangle tool, refer to Figures 1-39

through 1-41.
Save and close the file.

c.

Starting New Part File
1. Choose File > New from the menu bar. The New dialog box is displayed.

2. Select Part from the List of Types list box from this dialog box. Choose the OK button.

A new file in Part Design workbench will open.

3. Choose the Sketcher button from the Sketcher toolbar and then select the YZ

plane as the sketching plane, to invoke the Sketcher workbench.

You will draw the sketch in two sections, first the outer loop and next the inner cavity.

Drawing the Outer Loop of the Sketch

You will draw the outer loop of the sketch using the Line and the Arc tool. Start drawing
the outer loop from the left corner of the sketch. It is recommended to keep the origin in
middle of the drawn sketch, as this will reduce the time required for constraining and
dimensioning the sketches. This will also helps you to capture the design intent very easily.

1.

Invoke the Profile tool from the Profile toolbar.

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

Drawing Sketches in the Sketcher Workbench-I

                                 1-35

2. Move the cursor in the third quadrant. The coordinates of the point will be displayed above

the cursor.

3. Specify the start point of the line at the point whose coordinates are -40, -30 and then

move the cursor horizontally toward the right.

You will notice that the color of line turns blue, when you move the cursor horizontally.

4. Move the cursor to a location whose coordinates are 40, -30. The coordinates of the point

can be seen on top of the cursor.

5. Specify the endpoint of the line at this location. A rubber band line is attached to the

cursor. Move the cursor vertically upward.

6. Specify the endpoint of the second line on the point whose coordinates are 40mm, -20mm.

A rubber band line is attached to the cursor.

7. Move the cursor horizontally toward the left and specify the endpoint of the third line

where the value of the coordinates is 30, -20.

After  drawing  these  three  lines,  draw  a  tangent  arc  using  the  Tangent  Arc  option
available in the Profile tool.

8. Choose the Tangent Arc button available in the Sketch tools toolbar.

9. Move the cursor to a location whose coordinates are 20, -10 and specify the endpoint of
the tangent arc. Figure 1-39 shows the sketch, after drawing three lines and the tangent arc.
The system switches back to the Line mode.

Figure 1-39  Sketch after drawing three lines and a tangent arc

10. Move the cursor vertically upward to a location whose coordinates are 20, 10.

11. Specify the endpoint of the line at this location.

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

1-36

       CATIA for Designers (Evaluation Chapter F007/004)

Next, you need to draw a tangent arc by switching to the arc mode using the Tangent Arc
option available in the Profile tool.

12. Choose the Tangent Arc button from the Sketch tools toolbar.

13. Move the cursor to a location whose coordinates are 30, 20 and specify the endpoint of

the tangent arc.

The system switches back to the Line mode.

14. Move the cursor horizontally toward the right and specify the endpoint of the line, when

the value of the coordinates is 40, 20.

15. Move the cursor vertically upward and specify the endpoint of the line, when the value of

the coordinates is 40, 30.

16. Move the cursor horizontally toward the left and specify the endpoint of the line, when

the value of the coordinates is -40, 30.

17. Move  the  cursor  vertically  downward  and  specify  the  endpoint  of  the  line,  when  the

value of the coordinates is -40, 20.

18. Move the cursor horizontally toward the right and specify the endpoint of the line, when

the value of the coordinates is -30, 20.

Next, you need to draw a tangent arc by switching to the tangent arc mode.

19. Choose the Tangent Arc button from the Sketch tools toolbar to switch the tangent

arc mode.

20. Move the cursor to a location whose coordinates are -20, 10 and specify the endpoint of

arc at this location.

The system switches back to the Line mode.

21. Move  the  cursor  vertically  downward  and  specify  the  endpoint  of  the  line,  where  the

value of the coordinates is -20, -10.

22. Switch to the Tangent mode and move the cursor to a location whose coordinates are

-30mm, -20mm. Specify the endpoints of the tangent arc at this location.

23. Move the cursor horizontally toward the left and specify the endpoint of the line, when

the value of coordinates is -40, -20.

24. Move the cursor vertically downward and specify the endpoint of the line when it snaps
the  start  point  of  the  outer  loop.  The  sketch  after  completing  the  outer  loop  of  the
sketch, after hiding the constraints, is shown in Figure 1-40.

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

Drawing Sketches in the Sketcher Workbench-I

                                 1-37

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

Figure 1-40  Sketch after drawing outer loop of the sketch

Drawing the Inner Cavity of the Sketch

After drawing the outer loop of the sketch, you need to draw its inner rectangular cavity.
You will use the Rectangle tool to draw the inner cavity.

1. Choose the Rectangle tool from the Profile toolbar.

2. Move the cursor to a location whose coordinates are -10, 10. Specify the upper left corner

of the rectangle at this location.

3. Move  the  cursor  to  a  location  whose  coordinates  are  10,  -10.  Specify  the  lower-right

corner of the rectangle at this location.

4. Choose the Fit All in button from the View toolbar to fit the sketch in the geometry area.

The final sketch, after drawing the inner loop, is shown in Figure 1-41. Note that the
display of constraints has been turned on in this figure.

Figure 1-41  Final sketch after drawing inner loop of the sketch

1-38

       CATIA for Designers (Evaluation Chapter F007/004)

Saving the Sketch

After completing the sketch you need to save it. As mentioned earlier, you need to  save
each tutorial of this chapter in the c01 folder in the CATIA folder.

1. Choose the Save button from the Standard toolbar to invoke the Save As dialog
box. Browse for the folder named c01 that you created in the last tutorial.

2. Enter  the  name  of  the  file  as  c01tut2  in  the  File  name  edit  box  and  choose  the  Save

button. The file will be saved in the \My Documents\CATIA\c01 folder.

3. Close the part file by choosing File > Close from the menu bar.

Tutorial 3

In this tutorial, you will draw the sketch of the model shown in Figure 1-42. The sketch is
shown in Figure 1-43. You will not dimension the sketch. The solid model and the dimensions
are given only for your reference.
    (Expected time: 30 min)

Figure 1-42  Solid model for Tutorial 3

Figure 1-43  Sketch for the solid model

The following steps are required to complete this tutorial:

a. Start a new CATpart file.
b. Draw the sketch of the model using the Rectangle, Profile, and the Circle tools, refer to

Figures 1-44 through 1-46.
Save the sketch and close the file.

c.

Starting  New Part File
1. Choose File > New from the menu bar; the New dialog box is displayed.

2. Select Part from the List of Types list box in this dialog box. Choose the OK button.

A new file in the Part Design workbench will be opened.

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

Drawing Sketches in the Sketcher Workbench-I

                                 1-39

3. Choose the Sketcher button from the Sketcher toolbar and then select the YZ

plane as the sketching plane.

This sketch will be drawn in two parts. Initially, you will draw the outer loop of the sketch,
that is, a rectangle. Next, you need to draw the inner loops of the sketch, which consists
of multiple inner loops that are four holes and an elongated hole. First you will draw an
elongated hole using the Profile tool and then the four holes using the Circle tool.

Drawing the Outer Loop of the Sketch

The outer loop of the sketch will be drawn using the Rectangle tool.

1. Choose the Rectangle button from the Profile toolbar.

2. Move the cursor to a location whose coordinates are -60, -50 and specify the lower left

corner of the rectangle.

3. Move the cursor to the location whose coordinates are 60, 50 and specify the upper right corner
of the rectangle. Figure 1-44 shows the outer loop of the sketch drawn using the Rectangle tool.

Figure 1-44  Outer loop of the sketch

Drawing the Inner Loop of the Sketch

After drawing the outer loop of the sketch, draw its inner loop.

1. Choose the Profile button from the Profile toolbar.

2. Move the cursor to a location whose coordinates are -30, 10 and specify the start point of

the line.

3. Move the cursor horizontally toward the right and specify the endpoint of the line, when

the value of the coordinates is 30, 10.

Next, you need to draw a tangent arc by switching over to the Tangent Arc option using
the Sketch tools toolbar.

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

1-40

       CATIA for Designers (Evaluation Chapter F007/004)

4. Choose the Tangent Arc button from Sketch tools toolbar to switch over to the

arc mode.

5. Move the cursor to a location whose coordinates are 30, -10 and specify the endpoint of

the tangent arc.

The system switches over to the Line mode.

6. Move the cursor to the location whose coordinates are -30, -10 and specify the endpoint

of the line.

7. Choose the Tangent Arc button from the Sketch tools toolbar to switch over to the arc mode.

8. Move  the  cursor  to  the  start  point  of  the  first  horizontal  line  of  the  elongated  hole.

Specify the endpoint of the arc when it snaps the start point.

The sketch, after drawing the elongated hole, is shown in Figure 1-45.

Figure 1-45  Sketch after drawing the elongated hole

9. Choose the Circle button from the Circle toolbar.

Note
If you have closed the Circle toolbar, you can use the Profile toolbar to invoke the Line tool.

10. Move the cursor to a location whose coordinates are 40, 30 and specify the center point

of the circle.

11. Specify the value of 10 as the radius in the Radius edit box available in the Sketch tools

toolbar.

You will observe that a radius dimension is displayed attached to circle because you have
specified the value of the radius in the Radius edit box available in the Sketch tools toolbar.

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

Drawing Sketches in the Sketcher Workbench-I

                                 1-41

12. Choose the Circle button from the Circle toolbar.

13. Move  the  cursor  to  a  location  whose  coordinates  are  40,  -30  and  specify  the

center point of the circle.

14. Specify the value of 10 as the radius in the Radius edit box available in the Sketch tools toolbar.

15. Similarly, draw the other two circles. The coordinates of the center point of other two
circles are -40, 30 and -40, -30 respectively. The final sketch, with the display of constraints
turned on, is shown in Figure 1-46.

Figure 1-46  Final sketch

Saving the Sketch
1. Choose the Save button from the Standard toolbar to invoke the Save As dialog
box. Browse for the folder named c01 that you created in the first tutorial.

2. Enter  the  name  of  the  file  as  c01tut3  in  the  File  name  edit  box  and  choose  the  Save

button. The file will be saved in the \My Documents\CATIA\c01 folder.

3. Close the part file by choosing File > Close from the menu bar.

Tutorial 4

In this tutorial, you will draw the sketch of the model shown in Figure 1-47. The sketch is
shown in Figure 1-48. You will not dimension the sketch. The solid model and the dimensions
are given only for your reference.
    (Expected time: 30 min)

The following steps are required to complete this tutorial:

a. Start a new CATpart file.
b. Draw the sketch of the model using the Profile and the Circle tool, refer to Figures 1-49

and 1-50.
Save the sketch and close the file.

c.

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

1-42

       CATIA for Designers (Evaluation Chapter F007/004)

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

Figure 1-47  Solid model for Tutorial 4

Figure 1-48  Sketch for the solid model

Starting a New Part File
1. Choose New from File menu; the New dialog box is displayed.

2. Select Part from the List of Types list box from this dialog box. Choose the OK button.

A new file Part Design workbench is opened.

3. Choose the Sketcher button from the Sketcher toolbar and then select the YZ

plane as the sketching plane to invoke the Sketcher workbench.

This sketch will be drawn in two parts. Initially, you will draw the outer loop of the sketch
using the Profile tool and then the inner loop of the sketch, which is a hole.

Drawing the Outer Loop of the Sketch

The outer loop of the sketch will be drawn using the Profile tool. In this sketch the lower
left  corner  of  the  sketch  is  coincident  to  the  origin  of  the  Sketcher  workbench.  The
resulting sketch will be drawn in the first quadrant.

1. Choose the Profile button from the Profile toolbar.

2. Move the cursor to a location whose coordinates are 0, 0 and specify the start point of

the line.

3. Move the cursor horizontally toward the right and specify the endpoint of the line, when

the value of coordinates is 120, 0.

4. Move the cursor vertically upward and specify the endpoint of the line, when the value of

coordinates is 120, 10.

5. Move the cursor horizontally toward the left and specify the endpoint of the line, when

the value of the coordinates is 90, 10.

Drawing Sketches in the Sketcher Workbench-I

                                 1-43

6. Move the cursor vertically upward and specify the endpoint of the line, when the value of

the coordinates is 90, 30.

After drawing these four lines, the next element that you need to draw is a tangent arc.
You need to use the Tangent Arc option from the Sketch tool toolbar to draw it.

7. Choose the Tangent Arc button from the Sketch tools toolbar to switch to the

Tangent Arc mode.

8. Move the cursor to a location whose coordinates are 30, 30 and specify the endpoint of

the tangent arc at this location.

The system switches back to the Line mode.

9. Move  the  cursor  vertically  downward  and  specify  the  endpoint  of  the  line,  when  the

value of the coordinates is 30, 10.

10. Move the cursor horizontally toward the left and specify the endpoint of the line, when

the value of the coordinates is 0, 10.

11. Move the cursor vertically downward and specify the endpoint of the line such that the

endpoint is coincident with the start point of the first line.

The sketch, after drawing the outer loop, is shown in Figure 1-49.

Figure 1-49  Sketch after drawing the outer loop

Drawing the Inner Loop of the Sketch

The inner loop of the sketch consists of a circle that will be drawn, using the Circle tool,
concentric to the arc of the outer loop.

1. Choose the Circle button from the Circle or Profile toolbar.

2. Move the cursor to the center point of the circular arc and specify the center point of the circle.

3. Specify the value of 15, as the radius of circle in the Radius edit box provided in the

Sketch tools toolbar.

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

1-44

       CATIA for Designers (Evaluation Chapter F007/004)

The  final  sketch,  after  drawing  the  inner  loop  is  shown  in  Figure  1-50.  Note  that  the
display of constraints is turned on in this figure.

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

Figure 1-50  Final Sketch

Saving the Sketch
1. Choose the Save button from the Standard toolbar to invoke the Save As dialog box

and browse for the c01 folder.

2. Enter  the  name  of  the  file  as  c01tut4  in  the  File  name  edit  box  and  choose  the  Save

button. The file will be saved in the \My Documents\CATIA\c01 folder.

3. Close the part file by choosing File > Close from the menu bar.

SELF-EVALUATION TEST
Answer the following questions and then compare your answers with those given at the
end of this chapter.

1. The base feature of any design is a sketched feature, which is created by drawing the sketch. (T/F)

2. You can also draw an arc, while working with the Profile tool. (T/F)

3. To enter the Sketcher workbench you need to choose the Sketcher button. (T/F)

4. When you save a file in the sketching environment, it is opened in the part modeling

environment, when you open it next time. (T/F)

5. You can convert a sketched element into a construction element by using the __________ button.

6. To draw a rectangle at an angle, you need to use the __________ tool.

7. The __________ are the temporary lines that are used to track a particular point on the screen.

8. __________ tool is used to draw the continues lines.

9. Using __________ tool you can create a circle by specifying the coordinates of the center

point of circle.

Drawing Sketches in the Sketcher Workbench-I

                                 1-45

10. The rectangle is considered as a combination of individual __________.

REVIEW QUESTIONS
Answer the following questions.

1. The 3 point arcs are the ones that are drawn by defining the start point, endpoint, and a

point on the arc. (T/F)

2. The Parallelogram button is available in the Predefined Profile toolbar. (T/F)

3. The Symmetrical Extension button, when selected from the Sketch tools toolbar, draws

a simple line. (T/F)

4.

In  CATIA  V5,  circles  are  drawn  by  specifying  the  center  point  of  the  circle  and  then
entering the radius of the circle in the dialog box that is displayed. (T/F)

5. When you start CATIA V5, by default a file in the Product workbench is started. (T/F)

6.

In CATIA V5, a rectangle is considered as a combination of which of the following elements.

(a) Lines
(c) Splines

(b) Arcs
(d) None

7. Which tools is not available in the Predefined Profile toolbar?

(a) Rectangle
(c) Parallelogram

(b) Oriented Rectangle
(d) Circle

8. Which one of the following elements will not be considered, while converting a sketch

into a feature?

(a) Sketched circles
(c) Construction elements

(b) Sketched lines
(d) None

9. Which one of the following tools is available in the Line toolbar?

(a) Line
(c) Bisecting Line

(b) Infinite Line
(d) All of these

10. In which workbench of CATIA V5 can you draw the sketches that can be used to create

features?

(a) Part
(c) Shape

(b) Assembly
(d) None

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

1-46

       CATIA for Designers (Evaluation Chapter F007/004)

EXERCISES

Exercise 1

Draw  the  sketch  of  the  model  shown  in  Figure  1-51.  The  sketch  to  be  drawn  is  shown  in
Figure 1-52. Do not dimension the sketch, as the solid model and the dimensions are given
    (Expected time: 30 min)
only for your reference.

Figure 1-51  Solid Model for Exercise 1

Figure 1-52  Sketch of the model

Exercise 2

Draw  the  sketch  of  the  model  shown  in  Figure  1-53.  The  sketch  to  be  drawn  is  shown  in
Figure 1-54. Do not dimension the sketch as the solid model and the dimensions are given
only for your reference.
    (Expected time: 30 min)

Figure 1-53  Solid Model for Exercise 2

Figure 1-54  Sketch of the model

Answers to Self-Evaluation Test
1. T, 2. T, 3. T, 4. F, 5. Construction/Standard Element, 6. Oriented Rectangle, 7. inferencing
lines, 8. Profile, 9. Circle Using Coordinates, 10. lines

s
l
i
a
t
e
d
e
r
o
m
r
o
f
m
o
c
.
m
i
c
d
a
c
w.
w
w
o
t
n
o
g
o
L
r.
e
t
p
a
h
c
n
o
i
t
a
u
l
a
v
E

