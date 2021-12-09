describe("Test for initial Jest setup.", () => {
    describe("practiceTest", () => {
        test("Given 'Hello World!', return 'Hello World!'", () => {
            const received = "Hello World!";
            const expected = "Hello World!";
            expect(received).toBe(expected);
        });
    });

});
