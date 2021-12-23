webai.clear()
webai.img = webai.res.loadImg('bg.jpg')

webai.img.draw_ellipse(100, 120, 50, 80, 0, (255, 255, 255), fill=True)
webai.img.draw_ellipse(220, 120, 50, 80, 0, (255, 255, 255), fill=True)

webai.img.draw_circle(76, 120, 25, (139, 69, 19),fill=True)
webai.img.draw_circle(74, 117, 22, (0, 0, 0),fill=True)
webai.img.draw_circle(62, 115, 6, (255, 255, 255),fill=True)

webai.img.draw_circle(196, 120, 25, (139, 69, 19),fill=True)
webai.img.draw_circle(194, 117, 22, (0, 0, 0),fill=True)
webai.img.draw_circle(182, 115, 6, (255, 255, 255),fill=True)

webai.show(img=webai.img)